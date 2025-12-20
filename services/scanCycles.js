import { fileURLToPath } from "url";
import path, { dirname } from "path";
import logger from "../logger.js";
import mongoDbService from "./mongoDbService.js";
import { readBit, readRegister, writeBit, writeRegister } from "./modbus.js";
import ShiftUtility from "./ShiftUtility.js";
import BarcodeGenerator from "./barcodeGenrator.js";
import { promisify } from "util";
import fs from "fs";
import { format } from "date-fns";
import { Worker } from "worker_threads";
import process from "process";
import TcpScannerService from "./TcpScannerService.js";

const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);

const CODE_FILE_PATH = path.join(__dirname, "../data/code.txt");
const TEXT_FILE_PATH = path.join(__dirname, "../data/text.txt");
export const sleep = promisify(setTimeout);

const TIMEOUT = 100 * 1000;

// TCP Scanner configuration
const TCP_SCANNER_CONFIG = {
  host: process.env.SCANNER_HOST || "192.168.3.147", // Default TCP scanner IP
  port: parseInt(process.env.SCANNER_PORT, 10) || 9004, // Default TCP scanner port
  timeout: 5000,
  reconnectInterval: 3000,
  keepAlive: true, // Enable keep-alive to prevent idle timeouts
  keepAliveInitialDelay: 1000,
  logDir: "scanner_logs",
};

class ScannerController {
  static instance = null;

  constructor() {
    logger.section("Scanner Controller Initialization");

    if (ScannerController.instance) {
      logger.info("🔄 Returning existing scanner controller instance");
      return ScannerController.instance;
    }

    logger.info("🎯 Creating new scanner controller instance");
    this.resetMonitor = null;
    this.resetListeners = new Set();
    this.tcpScannerService = null;
    this.isInitialized = false;
    this.shiftUtility = new ShiftUtility();
    this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
    this.setupShutdownHandlers();
    this.isRunning = false;
    this.cycleCount = 0;
    this.isPulseOn = false;
    this.currentDayId = 1;
    this.lastResetDate = this.getLastResetTime();

    ScannerController.instance = this;
    logger.success("Scanner controller instance created");
  }

  async initialize() {
    logger.section("Scanner Controller Initialization");

    if (this.isInitialized) {
      logger.warn("⚠️ Scanner controller already initialized");
      return;
    }

    try {
      logger.info("🚀 Starting initialization sequence");

      // Initialize MongoDB connection
      logger.info("📦 Connecting to MongoDB...");
      await mongoDbService.connect("main-data", "records");
      logger.success("MongoDB connected successfully");

      // Initialize TCP scanner connection with better error handling
      logger.info("🔌 Setting up TCP scanner connection...");
      try {
        logger.info("🔍 Creating TcpScannerService instance...");
        this.tcpScannerService = new TcpScannerService(TCP_SCANNER_CONFIG);

        // Add error handler to prevent unhandled error events
        this.tcpScannerService.on("error", (err) => {
          logger.error(`TCP Scanner Service error: ${err.message}`, err);
          // Don't throw - let the reconnect mechanism handle it
        });

        logger.info(
          `🔍 tcpScannerService created: ${this.tcpScannerService ? "exists" : "null"}`
        );
        logger.info(
          `🔍 TCP Scanner Config - Host: ${TCP_SCANNER_CONFIG.host}, Port: ${TCP_SCANNER_CONFIG.port}`
        );

        logger.info("🔍 Calling initTcpConnection...");
        await this.tcpScannerService.initTcpConnection();
        logger.info(
          `🔍 After initTcpConnection - tcpScannerService: ${this.tcpScannerService ? "exists" : "null"}`
        );
        logger.success(
          `TCP scanner connected successfully at ${TCP_SCANNER_CONFIG.host}:${TCP_SCANNER_CONFIG.port}`
        );
      } catch (tcpError) {
        logger.error(
          `🔍 TCP scanner initialization failed: ${tcpError.message}`
        );
        // Set tcpScannerService to null on error to make debugging easier
        this.tcpScannerService = null;

        if (tcpError.message.includes("ECONNREFUSED")) {
          logger.error(
            "❌ TCP Scanner Connection Refused - Troubleshooting suggestions:"
          );
          logger.error("   1. Check if the TCP scanner is powered on");
          logger.error(
            "   2. Verify the scanner's IP address and port settings"
          );
          logger.error("   3. Check network connectivity to the scanner");
          logger.error("   4. Ensure no firewall is blocking the connection");
          logger.error("   5. Try pinging the scanner IP address");
          logger.error(
            `   6. Verify scanner is listening on port ${TCP_SCANNER_CONFIG.port}`
          );
        } else if (tcpError.message.includes("EHOSTUNREACH")) {
          logger.error("❌ TCP Scanner Host Unreachable");
          logger.error("   1. Check if the scanner IP address is correct");
          logger.error("   2. Verify network connectivity");
          logger.error("   3. Check if scanner is on the same network segment");
        } else if (tcpError.message.includes("ETIMEDOUT")) {
          logger.error("❌ TCP Scanner Connection Timeout");
          logger.error("   1. Check if the scanner is responding");
          logger.error("   2. Verify network latency is acceptable");
          logger.error("   3. Try increasing the connection timeout");
        }

        logger.info(`💡 Current TCP Scanner Configuration:`);
        logger.info(`   - Host: ${TCP_SCANNER_CONFIG.host}`);
        logger.info(`   - Port: ${TCP_SCANNER_CONFIG.port}`);
        logger.info(`   - Timeout: ${TCP_SCANNER_CONFIG.timeout}ms`);

        throw new Error(`TCP Scanner Error: ${tcpError.message}`);
      }

      // Initialize barcode generator
      logger.info("🏷️ Setting up barcode generator...");
      this.shiftUtility = new ShiftUtility();
      this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
      await this.barcodeGenerator.initialize("main-data", "records");
      logger.success("Barcode generator initialized");

      this.isInitialized = true;
      logger.success("Scanner controller initialization complete");
    } catch (error) {
      logger.separator.hash();
      logger.error("❌ Error during initialization:", error);
      this.isInitialized = false;

      if (error.message.includes("MongoDB")) {
        logger.info("⏳ Waiting 5 seconds before retrying MongoDB connection");
        await sleep(5000);
        return this.initialize();
      }

      throw error;
    }
  }

  async resetBits() {
    logger.info("🔄 Resetting bits...");
    await this.resetSpecificBits(1414, [3, 4, 6, 7]);
    await this.resetSpecificBits(1415, [4]);

    // Note: Model-specific bits are NOT reset here - they stay ON throughout the session

    logger.success("Bits reset successfully");
  }

  async resetSpecificBits(register, bitsToReset) {
    try {
      logger.info(
        `🎯 Resetting bits ${bitsToReset.join(", ")} in register ${register}`
      );

      if (
        !Array.isArray(bitsToReset) ||
        bitsToReset.some((bit) => bit < 0 || bit > 15)
      ) {
        throw new Error("Invalid bits array. Must be an array of numbers 0-15");
      }

      const [currentValue] = await readRegister(register, 1);
      const mask = bitsToReset.reduce(
        (mask, bit) => mask & ~(1 << bit),
        0xffff
      );
      const newValue = currentValue & mask;

      const resetPromise = writeRegister(register, newValue);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Timeout resetting bits in register ${register}`)),
          TIMEOUT
        )
      );

      await Promise.race([resetPromise, timeoutPromise]);
      logger.success(
        `Reset complete for bits ${bitsToReset.join(", ")} in register ${register}`
      );
    } catch (error) {
      logger.separator.hash();
      logger.error(`❌ Error resetting bits in register ${register}:`, error);
      throw error;
    }
  }

  setupShutdownHandlers() {
    logger.info("🔧 Setting up shutdown handlers");

    if (!this.shutdownHandlersSet) {
      process.on("SIGINT", async () => {
        logger.section("Shutdown Sequence - SIGINT");
        await this.cleanup();
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        logger.section("Shutdown Sequence - SIGTERM");
        await this.cleanup();
        process.exit(0);
      });

      this.shutdownHandlersSet = true;
      logger.success("Shutdown handlers configured");
    }
  }

  async cleanup() {
    logger.section("Cleanup Process");

    try {
      if (this.resetMonitor) {
        logger.info("🔄 Terminating reset monitor...");
        this.resetMonitor.terminate();
      }

      if (this.tcpScannerService) {
        logger.info("🔌 Closing TCP scanner connection...");
        await this.tcpScannerService.closeConnection();
      }

      logger.info("📦 Disconnecting from MongoDB...");
      await mongoDbService.disconnect();

      logger.info("🔄 Performing final bit reset...");
      await this.resetBits();

      logger.success("Cleanup completed successfully");
    } catch (error) {
      logger.separator.hash();
      logger.error("❌ Error during cleanup:", error);
      throw error;
    }
  }

  async checkResetOrBit(register, bit, value, timeout = null) {
    if (timeout === null) {
      logger.info(
        `🔄 Waiting indefinitely for PLC bit ${register}.${bit} to become ${value} (no timeout)`
      );
    } else {
      logger.info(
        `🧹 Waiting for bit ${register}.${bit} to become ${value} (timeout: ${timeout / 1000}s)`
      );
    }

    logger.info(
      "-----------------------------------------------------------------------------------------------------------"
    );

    // For PLC bit monitoring, wait indefinitely until proper signals arrive
    // No timeout or retry limits - let PLC workflow control the timing

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const result = await this.singleCheckAttempt(
          register,
          bit,
          value,
          timeout,
          this.io
        );
        if (result === "safety_violation") {
          logger.error(
            "🚨 SAFETY VIOLATION DETECTED - Stopping cycle immediately"
          );
          throw new Error("SAFETY_VIOLATION");
        }
        if (result !== "timeout") {
          return result;
        }
        // If we get a timeout from singleCheckAttempt, just continue the loop
        // This ensures we keep waiting for PLC signals indefinitely
        logger.info(
          `🔄 Continuing to wait for PLC bit ${register}.${bit} = ${value}...`
        );
      } catch (error) {
        logger.error(`Error in bit check: ${error.message}`);
        await sleep(1000);
        // Continue the loop even on errors
      }
    }
  }

  async singleCheckAttempt(register, bit, value, timeout, io = null) {
    return new Promise((resolve) => {
      let timeoutId = null;

      // Only set timeout if a timeout value is provided
      if (timeout !== null && timeout > 0) {
        timeoutId = setTimeout(() => {
          cleanup();
          logger.warn(`⏰ Timeout after ${timeout / 1000} seconds`);
          resolve("timeout");
        }, timeout);
      }

      let checkCount = 0;
      const CHECK_INTERVAL = 100;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (resetCheckInterval) {
          clearInterval(resetCheckInterval);
        }
        if (bitCheckInterval) {
          clearInterval(bitCheckInterval);
        }
        if (safetyCheckInterval) {
          clearInterval(safetyCheckInterval);
        }
      };

      // Safety check interval - runs in parallel every 500ms
      console.log("🔧 Creating safety check interval...");
      const safetyCheckInterval = setInterval(async () => {
        try {
          console.log(
            "🔍 Safety check running - reading register 1490 bits..."
          );
          logger.debug(
            "🔍 Safety check running - reading register 1490 bits..."
          );

          // Read safety bits from register 1490
          console.log("🔍 About to read safety bits...");

          // Read safety bits one by one to avoid timeout issues
          console.log("🔍 Reading safety bits individually...");

          const partPresent = await readBit(1490, 0); // Part not present. 1490.0
          const emergencyStop = await readBit(1490, 1); // Emergency stop. 1490.1
          const safetySensor = await readBit(1490, 2); // Safety sensor. 1490.2
          const emergencyPushButton = await readBit(1490, 3); // Emergency push button pressed. 1490.3
          const safetyCurtain = await readBit(1490, 4); // Safety curtain interrupted. 1490.4
          const fixtureProgramMismatch = await readBit(1490, 5); // Fixture and marking program mismatch. 1490.5
          const servoNotHome = await readBit(1490, 6); // Servo not home position. 1490.6
          const grooveMissing = await readBit(1490, 7); // Groove missing. 1490.7

          console.log(
            `🔍 Safety bits read: partPresent=${partPresent}, emergencyStop=${emergencyStop}, safetySensor=${safetySensor}, emergencyPushButton=${emergencyPushButton}, safetyCurtain=${safetyCurtain}, fixtureProgramMismatch=${fixtureProgramMismatch}, servoNotHome=${servoNotHome}, grooveMissing=${grooveMissing}`
          );
          logger.debug(
            `🔍 Safety bits read: partPresent=${partPresent}, emergencyStop=${emergencyStop}, safetySensor=${safetySensor}, emergencyPushButton=${emergencyPushButton}, safetyCurtain=${safetyCurtain}, fixtureProgramMismatch=${fixtureProgramMismatch}, servoNotHome=${servoNotHome}, grooveMissing=${grooveMissing}`
          );

          // Check safety conditions
          if (partPresent) {
            cleanup();
            logger.error("🚨 SAFETY VIOLATION: Part not present (1490.0 = 0)");

            // Emit safety violation event to UI immediately
            const ioInstance = io || this.io;
            if (ioInstance) {
              ioInstance.emit("safety_violation", {
                timestamp: new Date().toISOString(),
                violation: "Part not present ",
                cycleNumber: this.cycleCount,
              });
            }

            resolve("safety_violation");
            return;
          }

          if (emergencyStop) {
            cleanup();
            logger.error(
              "🚨 SAFETY VIOLATION: Emergency stop activated (1490.1 = 1)"
            );

            // Emit safety violation event to UI immediately
            const ioInstance = io || this.io;
            if (ioInstance) {
              ioInstance.emit("safety_violation", {
                timestamp: new Date().toISOString(),
                violation: "Emergency stop activated ",
                cycleNumber: this.cycleCount,
              });
            }

            resolve("safety_violation");
            return;
          }

          if (safetySensor) {
            cleanup();
            logger.error(
              "🚨 SAFETY VIOLATION: Safety sensor not engaged (1490.2 = 0)"
            );

            // Emit safety violation event to UI immediately
            const ioInstance = io || this.io;
            if (ioInstance) {
              ioInstance.emit("safety_violation", {
                timestamp: new Date().toISOString(),
                violation: "Safety sensor not engaged",
                cycleNumber: this.cycleCount,
              });
            }

            resolve("safety_violation");
            return;
          }

          // Check for emergency push button pressed
          if (emergencyPushButton) {
            cleanup();
            logger.error(
              "🚨 SAFETY VIOLATION: Emergency push button pressed (1490.3 = 1)"
            );

            // Emit safety violation event to UI immediately
            const ioInstance = io || this.io;
            if (ioInstance) {
              ioInstance.emit("safety_violation", {
                timestamp: new Date().toISOString(),
                violation: "Emergency push button pressed",
                cycleNumber: this.cycleCount,
              });
            }

            resolve("safety_violation");
            return;
          }

          // Check for safety curtain interrupted
          if (safetyCurtain) {
            cleanup();
            logger.error(
              "🚨 SAFETY VIOLATION: Safety curtain interrupted (1490.4 = 0)"
            );

            // Emit safety violation event to UI immediately
            const ioInstance = io || this.io;
            if (ioInstance) {
              ioInstance.emit("safety_violation", {
                timestamp: new Date().toISOString(),
                violation: "Safety curtain interrupted",
                cycleNumber: this.cycleCount,
              });
            }

            resolve("safety_violation");
            return;
          }

          // Check for fixture and marking program mismatch
          if (fixtureProgramMismatch) {
            cleanup();
            logger.error(
              "🚨 SAFETY VIOLATION: Fixture and marking program mismatch (1490.5 = 1)"
            );

            // Emit safety violation event to UI immediately
            const ioInstance = io || this.io;
            if (ioInstance) {
              ioInstance.emit("safety_violation", {
                timestamp: new Date().toISOString(),
                violation:
                  "Fixture and marking program mismatch - check program and fixture",
                cycleNumber: this.cycleCount,
              });
            }

            resolve("safety_violation");
            return;
          }

          // Check for servo not home position
          if (servoNotHome) {
            cleanup();
            logger.error(
              "🚨 SAFETY VIOLATION: Servo not home position (1490.6 = 0)"
            );

            // Emit safety violation event to UI immediately
            const ioInstance = io || this.io;
            if (ioInstance) {
              ioInstance.emit("safety_violation", {
                timestamp: new Date().toISOString(),
                violation: "Servo not home position",
                cycleNumber: this.cycleCount,
              });
            }

            resolve("safety_violation");
            return;
          }

          // Check for groove missing
          if (grooveMissing) {
            cleanup();
            logger.error("🚨 SAFETY VIOLATION: Groove missing (1490.7 = 1)");

            // Emit safety violation event to UI immediately
            const ioInstance = io || this.io;
            if (ioInstance) {
              ioInstance.emit("safety_violation", {
                timestamp: new Date().toISOString(),
                violation: "Groove missing",
                cycleNumber: this.cycleCount,
              });
            }

            resolve("safety_violation");
            return;
          }
        } catch (error) {
          console.error(
            `❌ Error checking safety conditions: ${error.message}`
          );
          console.error(`❌ Error stack: ${error.stack}`);
          logger.error(`❌ Error checking safety conditions: ${error.message}`);
          logger.error(
            "❌ Safety check failed - this could prevent safety violations from being detected!"
          );
        }
      }, 500);

      console.log("✅ Safety check interval created successfully");

      // Reset check interval
      const resetCheckInterval = setInterval(async () => {
        try {
          const resetSignal = await readBit(1600, 0);
          if (resetSignal) {
            cleanup();
            logger.info("Reset signal (1600.0) detected");
            try {
              await writeBit(1500, 3, 1);
              logger.info("Reset bits completed, restarting cycle");
              resolve(true);
            } catch (error) {
              logger.error("Error during reset bits:", error);
              resolve("timeout");
            }
          }
        } catch (error) {
          logger.error(`Error checking reset signal: ${error.message}`);
        }
      }, CHECK_INTERVAL);

      // Bit check interval
      const bitCheckInterval = setInterval(async () => {
        try {
          checkCount++;
          const bitValue = await readBit(register, bit);
          const currentValue = Number(bitValue);
          const expectedValue = Number(value);

          if (currentValue === expectedValue) {
            cleanup();
            logger.info(
              `✅ Target bit ${register}.${bit} is now ${value}, proceeding`
            );
            resolve(false);
            return;
          }

          // Log status every 5 seconds
          if (checkCount % 10 === 0) {
            logger.info(
              `Waiting... (${(checkCount * CHECK_INTERVAL) / 1000}s elapsed)`
            );
            const resetSignal = await readBit(1600, 0);
            logger.info(
              `Current state: Reset(1600.0): ${resetSignal}, ${register}.${bit}: ${currentValue}, Waiting for: ${expectedValue}`
            );
          }
        } catch (error) {
          logger.error(`Error checking bit value: ${error.message}`);
        }
      }, CHECK_INTERVAL);

      // Initial checks
      const performInitialCheck = async () => {
        try {
          const [resetSignal, bitValue] = await Promise.all([
            readBit(1600, 0),
            readBit(register, bit),
          ]);

          if (resetSignal) {
            cleanup();
            logger.info("Reset signal detected on initial check");
            await this.resetBits();
            resolve(true);
            return;
          }

          if (Number(bitValue) === Number(value)) {
            cleanup();
            logger.info(`Target bit matched on initial check`);
            resolve(false);
            return;
          }
        } catch (error) {
          logger.error(`Error in initial checks: ${error.message}`);
        }
      };

      performInitialCheck();
    });
  }

  async writeOCRDataToFile(ocrDataString) {
    try {
      await this.clearCodeFile(CODE_FILE_PATH);
      fs.writeFileSync(CODE_FILE_PATH, ocrDataString, "utf8");
      logger.info("OCR data written to code.txt");
    } catch (error) {
      logger.error(`Error writing OCR data to file: ${error.message}`);
      throw error;
    }
  }

  async clearCodeFile(path) {
    try {
      fs.writeFileSync(path, "", "utf8");
      logger.info("Code file cleared.");
    } catch (error) {
      logger.error(`Error clearing code file: ${error.message}`);
      throw error;
    }
  }

  async compareScannerDataWithCode(scannerData) {
    try {
      const codeData = fs.readFileSync(CODE_FILE_PATH, "utf8").trim();
      const isMatch = scannerData === codeData;
      logger.info(`Comparison result: ${isMatch ? "Match" : "No match"}`);
      return isMatch;
    } catch (error) {
      logger.error(
        `Error comparing scanner data with code file: ${error.message}`
      );
      throw error;
    }
  }

  async saveToMongoDB({
    io,
    serialNumber,
    markingData,
    scannerData,
    grading,
    result,
    isUpdate = false,
  }) {
    const now = new Date();
    const timestamp = format(now, "yyyy-MM-dd HH:mm:ss");

    try {
      const userDetails = (await mongoDbService.getUserDetails?.()) || {
        email: "Unknown",
      };
      const currentId = await this.getCurrentDayId();
      const modelNumber = await this.getCurrentModelNumber();

      const data = {
        Timestamp: new Date(timestamp),
        SerialNumber: serialNumber,
        MarkingData: markingData,
        ScannerData: scannerData,
        ModelNumber: modelNumber,
        Result: result
          ? result === "N/A"
            ? "N/A"
            : result === "OK" || result === true
              ? "OK"
              : "NG"
          : "NG",
        User: userDetails?.email || "Unknown",
        Grade: grading && grading !== "N/A" ? grading.toUpperCase() : "N/A",
        CurrentId: currentId,
      };

      // Use upsert pattern: check if record exists, update if found, insert if not
      // Use MarkingData as primary identifier since it's unique
      const filter =
        markingData && markingData.trim() !== ""
          ? { MarkingData: markingData }
          : { SerialNumber: serialNumber, ModelNumber: modelNumber };

      if (isUpdate) {
        // Update existing record
        logger.info(
          `🔄 Attempting to update record for MarkingData: ${markingData || "N/A"}`
        );
        logger.info(
          `📊 Update data: ScannerData=${scannerData}, Result=${result}`
        );

        const updateResult = await mongoDbService.updateLastRecord(
          filter,
          { $set: data },
          "main-data",
          "records"
        );

        if (updateResult) {
          logger.info(
            `✅ Successfully updated MongoDB record using filter: ${JSON.stringify(filter)}`
          );
          logger.info(`📋 Updated fields: ${JSON.stringify(data)}`);
        } else {
          logger.warn(
            `⚠️ Failed to find/update record for filter: ${JSON.stringify(filter)}`
          );
          logger.warn(
            `⚠️ Record may not exist yet. Attempting to insert as new record.`
          );
          // If update fails, try to insert (will be caught by duplicate check if exists)
          await mongoDbService.insertRecord(data, "main-data", "records");
        }
      } else {
        // Check if record exists first, update if found, insert if not
        if (markingData && markingData.trim() !== "") {
          const duplicateCheck = await mongoDbService.checkMarkingDataExists(
            markingData,
            "main-data",
            "records"
          );

          if (duplicateCheck.exists) {
            logger.info(
              `🔄 Record with MarkingData already exists, updating instead of inserting`
            );
            const updateResult = await mongoDbService.updateLastRecord(
              filter,
              { $set: data },
              "main-data",
              "records"
            );
            if (updateResult) {
              logger.info(
                `✅ Successfully updated existing record for MarkingData: ${markingData}`
              );
            } else {
              logger.warn(
                `⚠️ Failed to update existing record, but duplicate check confirmed it exists`
              );
            }
          } else {
            // No duplicate found, safe to insert
            logger.info(
              `📝 Inserting new record for SerialNumber: ${serialNumber}, Model: ${modelNumber}`
            );
            await mongoDbService.insertRecord(data, "main-data", "records");
            logger.info(
              `✅ Data saved to MongoDB with CurrentId: ${currentId}, Model: ${modelNumber}`
            );
          }
        } else {
          // No MarkingData available, just insert (will be caught by duplicate check if needed)
          logger.info(
            `📝 Inserting new record for SerialNumber: ${serialNumber}, Model: ${modelNumber}`
          );
          await mongoDbService.insertRecord(data, "main-data", "records");
          logger.info(
            `✅ Data saved to MongoDB with CurrentId: ${currentId}, Model: ${modelNumber}`
          );
        }
      }

      if (io) {
        // Use broadcast method to refresh all connected clients
        mongoDbService.broadcastDataToAllClients(io, "main-data", "records");
        console.log("broadcastDataToAllClients");
      }
    } catch (error) {
      console.error({ error });
      logger.error("Error saving data:", error);
      throw error;
    }
  }

  async verifyAndRetryWrite(expectedData, retriesLeft) {
    for (let attempt = 1; attempt <= retriesLeft + 1; attempt++) {
      const actualData = await fs.readFileSync(CODE_FILE_PATH, "utf8");
      if (actualData === expectedData) {
        return true;
      }

      if (attempt <= retriesLeft) {
        logger.warn(
          `Verification attempt ${attempt} failed. Retrying write operation...`
        );
        await fs.writeFileSync(CODE_FILE_PATH, expectedData, "utf8");
      }
    }

    return false;
  }

  async runContinuousScan(io = null, tcpScannerService, { partNumber }) {
    this.io = io;
    this.currentPartNumber = partNumber;
    this.isRunning = true;
    logger.info(
      `🔄 Starting continuous scan (current cycle count: ${this.cycleCount})`
    );

    try {
      await this.initializeScannerAndMonitor(io, this.tcpScannerService);

      while (this.isRunning) {
        try {
          // await sleep(10000); // Changed from 1200ms to 10000ms (10 seconds)

          // Clear separator and print cycle count
          logger.separator.hash();
          logger.warn(`⚡ Scan Cycle ${this.cycleCount + 1}`);
          logger.separator.hash();

          // Create new reset monitoring for each cycle
          const resetMonitoring = this.startResetMonitoring();

          await Promise.race([
            this.executeScanCycle(this.tcpScannerService, partNumber),
            resetMonitoring,
          ]);

          // Cleanup monitoring after cycle
          this.cleanupResetListeners();
        } catch (error) {
          if (error.message === "RESET_DETECTED") {
            logger.warn("⚠️ Reset detected, restarting cycle");
            continue;
          } else if (error.message === "RESTART_CYCLE") {
            logger.info("🔄 Restarting cycle due to OK first scan");
            continue;
          }
          await this.handleScanError(error);
        }
      }
    } catch (error) {
      logger.error("❌ Fatal error in continuous scan:", error);
      throw error;
    } finally {
      this.cleanupResetListeners();
    }
  }

  // New method to encapsulate the main scan cycle logic
  async executeScanCycle(tcpScannerService, partNumber) {
    // First check for 1410.0 (start signal)
    logger.info("Waiting for start signal (1410.0)...");
    const resetResult = await this.checkResetOrBit(1410, 0, 1);
    if (resetResult === true) {
      logger.info("Reset detected, restarting cycle");
      return;
    }

    // Check if we need to set additional bit for specific model
    await this.handleModelSpecificBits();

    // Step 1: First Scanner Check
    const firstScanResult = await this.handleFirstScan(tcpScannerService);
    if (!firstScanResult.shouldContinue) {
      logger.info("Cycle stopped after first scan");
      return;
    }

    // Step 2: Generate and Write Barcode (simplified, no OCR)
    const barcodeData = await this.generateAndWriteBarcode(partNumber);
    if (!barcodeData) {
      return;
    }

    // Step 3: Signal Transfer and Wait
    logger.info("✍️ Writing bit 1414.15(F) to signal file transfer");
    await writeBit(1414, 15, 1);

    logger.info("🔍 Checking for reset or waiting for bit 1410.3");
    if (await this.checkResetOrBit(1410, 3, 1)) {
      logger.warn(
        "⚠️ Reset detected while waiting for 1410.3, restarting cycle"
      );
      // await sleep(1000);
      await this.saveToMongoDB({
        io: this.io,
        serialNumber: barcodeData.serialNo,
        markingData: barcodeData.text,
        scannerData: "N/A",
        result: "NG",
        grading: "N/A",
        isUpdate: true,
      });
      return;
    }

    // Step 4: Verification Scanner Check
    const verificationScanResult = await this.handleVerificationScan(
      tcpScannerService,
      barcodeData
    );

    // Step 5: Final Checks and Cleanup
    logger.info("🔍 Starting final checks and cycle completion...");
    const finalChecksResult = await this.performFinalChecks();
    logger.info(`📋 Final checks result: ${finalChecksResult}`);
    logger.info(
      `🔍 Verification scan result: ${verificationScanResult.success}`
    );

    // Note: Model-specific bits are kept ON throughout the session, not reset after each cycle

    if (finalChecksResult) {
      this.cycleCount++;
      logger.section(`✅ Completed Scan Cycle ${this.cycleCount}`);
      logger.info(`🎯 Cycle count incremented to: ${this.cycleCount}`);

      // Trigger UI refresh on successful cycle completion
      if (this.io) {
        logger.info("📡 Broadcasting cycle completion to UI...");
        await mongoDbService.broadcastDataToAllClients(
          this.io,
          "main-data",
          "records"
        );

        // Also emit a specific cycle completion event
        this.io.emit("scan-cycle-completed", {
          cycleNumber: this.cycleCount,
          timestamp: new Date().toISOString(),
          success: true,
          result: verificationScanResult.success ? "OK" : "NG",
        });
      }

      // Add 2-second delay after cycle completion
      logger.info(
        "⏸️ Cycle completed - waiting 2 seconds before next cycle..."
      );
      await sleep(2000);
    } else {
      logger.warn(`❌ Cycle completion failed:`);
      logger.warn(`   - Final checks: ${finalChecksResult}`);
      logger.warn(
        `   - Verification success: ${verificationScanResult.success}`
      );
      logger.warn(`   - Current cycle count remains: ${this.cycleCount}`);

      // Trigger UI refresh even for failed cycles
      if (this.io) {
        logger.info("📡 Broadcasting failed cycle data to UI...");
        await mongoDbService.broadcastDataToAllClients(
          this.io,
          "main-data",
          "records"
        );

        // Emit failed cycle event
        this.io.emit("scan-cycle-completed", {
          cycleNumber: this.cycleCount,
          timestamp: new Date().toISOString(),
          success: false,
          result: "NG",
          error: "Cycle completion failed",
        });
      }

      // Add 2-second delay even for failed cycles
      logger.info("⏸️ Cycle failed - waiting 2 seconds before retry...");
      await sleep(2000);
    }
  }

  async handleError(error) {
    logger.section("Error Handler");
    logger.error("❌ Processing error:", error);

    try {
      logger.info("🔄 Attempting error recovery...");
    } catch (secondaryError) {
      logger.error("❌ Error during error handling:", secondaryError);
    }
  }

  async checkReset() {
    return new Promise((resolve) => {
      // If resetEmitter is not available, resolve immediately with false
      if (!this.resetEmitter) {
        resolve(false);
        return;
      }

      const resetHandler = () => {
        this.resetEmitter.removeListener("reset", resetHandler);
        resolve(true);
      };

      this.resetEmitter.once("reset", resetHandler);
      setTimeout(() => {
        this.resetEmitter.removeListener("reset", resetHandler);
        resolve(false);
      }, 50);
    });
  }

  async fetchScannerData(tcpScannerService, options = {}) {
    const {
      scanType = options.scanType || "first",
      timeout = 10 * 1000, // Changed from 30 seconds to 10 seconds
      scannerLabel = this.getScanLabel(scanType),
    } = options;

    logger.section(`${scannerLabel} Scanner Data Acquisition`);

    // Prevent multiple triggers
    if (this.isScanning) {
      logger.warn("Scanner already in progress, skipping new trigger");
      return null;
    }
    this.isScanning = true;

    try {
      logger.info(
        `🎯 Setting up data listener for ${scannerLabel.toLowerCase()} scan...`
      );

      const scannerData = await new Promise((resolve, reject) => {
        const dataHandler = (data) => {
          logger.success(
            `📥 Data received from ${scannerLabel.toLowerCase()} scanner: ${data}`
          );
          resolve(data);
          this.tcpScannerService.off("dataGot", dataHandler);
        };

        // Set up event listener
        logger.info("👂 Adding event listener for scanner data");
        this.tcpScannerService.on("dataGot", dataHandler);

        // Configure timeout with better debugging
        const timeoutId = setTimeout(() => {
          logger.error(
            `⏰ TIMEOUT: No data received from ${scannerLabel.toLowerCase()} scanner after ${timeout / 1000} seconds`
          );
          logger.error("🔍 Troubleshooting suggestions:");
          logger.error(
            "   1. Check if scanner is physically connected to COM3"
          );
          logger.error("   2. Verify scanner is powered on");
          logger.error("   3. Check if barcode is present for scanner to read");
          logger.error(
            "   4. Verify scanner is reachable via network (ping test)"
          );
          logger.error("   5. Test scanner with a simple TCP client");

          this.tcpScannerService.off("dataGot", dataHandler);

          // Return "NG" on timeout and ensure proper bit handling
          logger.warn(
            "🔧 Scanner timeout - treating as NG to continue workflow"
          );
          resolve("NG");
        }, timeout);

        // Trigger scanner based on scan type
        const register = this.getScanRegister(scanType);
        const bit = this.getScanBit(scanType);

        logger.info(`🔄 Triggering ${scannerLabel.toLowerCase()} scanner...`);
        logger.info(`📡 PLC Trigger: Register ${register}, Bit ${bit}`);

        // Add 200ms delay before triggering scanner ON
        setTimeout(() => {
          logger.info(`⏳ 200ms delay completed, now triggering scanner...`);

          writeBit(register, bit, 1)
            .then(() => {
              logger.success(`${scannerLabel} scanner triggered successfully`);
              logger.info(
                `⏳ Waiting for scanner data via TCP... (timeout: ${timeout / 1000}s)`
              );
            })
            .catch((err) => {
              logger.error(
                `❌ Error triggering ${scannerLabel.toLowerCase()} scanner:`,
                err
              );
              clearTimeout(timeoutId);
              reject(err);
            });
        }, 200);
      });

      logger.success(
        `📊 ${scannerLabel} scanner data received: ${scannerData}`
      );

      // Emit scanner read event to UI
      if (this.io) {
        this.io.emit("scanner_read", {
          timestamp: new Date(),
          scannerType: scannerLabel,
          data: scannerData,
        });
      }

      return scannerData;
    } catch (error) {
      logger.separator.hash();
      logger.error(
        `❌ Error acquiring ${scannerLabel.toLowerCase()} scanner data:`,
        error
      );
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  // Helper method to clean scanner data - only strip CR/LF, preserve spaces/zeros
  cleanScannerData(scannerData) {
    if (!scannerData) {
      return scannerData;
    }

    // Remove only CR/LF to normalize, keep spaces and content intact
    const cleaned = scannerData.toString().replace(/[\r\n]+/g, "");

    // If data contains "NG" (case insensitive), return "NG"
    if (cleaned.toUpperCase().includes("NG")) {
      return "NG";
    }

    // For valid data (not NG), ONLY remove newlines and whitespace
    // NEVER remove leading zeros - they are part of the valid data
    return cleaned;
  }

  // Parse scanner payload of the form "<data>: <grade>" preserving data exactly
  parseScannerPayload(scannerData) {
    const cleaned = this.cleanScannerData(scannerData);
    if (!cleaned || cleaned === "NG") {
      return { mainData: cleaned, grade: "N/A" };
    }

    const lastColonIdx = cleaned.lastIndexOf(":");
    if (lastColonIdx === -1) {
      return { mainData: cleaned, grade: "N/A" };
    }

    const left = cleaned.slice(0, lastColonIdx); // preserve exactly
    const right = cleaned.slice(lastColonIdx + 1); // may contain space + grade

    // Extract last non-space character as grade
    const rightTrimEnd = right.replace(/[\r\n]+/g, "");
    const match = rightTrimEnd.match(/\s*([A-Za-z])\s*$/);
    const grade = match ? match[1].toUpperCase() : "N/A";

    return { mainData: left, grade };
  }

  // Handle model-specific bit operations
  async handleModelSpecificBits() {
    try {
      const currentModel = await this.getCurrentModelNumber();

      // First, ensure all model-specific bits are OFF for clean state
      logger.info(
        "🔧 Resetting all model-specific bits D1810.0, D1810.1, D1810.2 to OFF first"
      );

      // Use sequential operations instead of Promise.all to avoid hanging
      // Add timeout protection to prevent hanging
      const writeBitWithTimeout = async (
        register,
        bit,
        value,
        timeoutMs = 5000
      ) => {
        const writePromise = writeBit(register, bit, value);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `Timeout writing bit ${bit} to register ${register} after ${timeoutMs}ms`
                )
              ),
            timeoutMs
          );
        });
        return Promise.race([writePromise, timeoutPromise]);
      };

      logger.info("🔧 Resetting bit D1810.0 to OFF...");
      await writeBitWithTimeout(1810, 0, 0);
      logger.info("🔧 Resetting bit D1810.1 to OFF...");
      await writeBitWithTimeout(1810, 1, 0);
      logger.info("🔧 Resetting bit D1810.2 to OFF...");
      await writeBitWithTimeout(1810, 2, 0);

      logger.success("✅ All model-specific bits reset to OFF");

      if (currentModel === "FRONT_LEFT 1025969") {
        logger.info(
          "🔧 Model FRONT_LEFT 1025969 detected - setting additional bit D1810.0"
        );
        await writeBitWithTimeout(1810, 0, 1);
        logger.success(
          "✅ Additional bit D1810.0 set to ON for FRONT_LEFT 1025969 model"
        );
      } else if (currentModel === "FRONT_RIGHT 1025974") {
        logger.info(
          "🔧 Model FRONT_RIGHT 1025974 detected - setting additional bit D1810.1"
        );
        await writeBitWithTimeout(1810, 1, 1);
        logger.success(
          "✅ Additional bit D1810.1 set to ON for FRONT_RIGHT 1025974 model"
        );
      } else if (currentModel) {
        // For all other models, set D1810.2
        logger.info(
          `🔧 Model ${currentModel} detected - setting additional bit D1810.2 for other models`
        );
        await writeBitWithTimeout(1810, 2, 1);
        logger.success(
          `✅ Additional bit D1810.2 set to ON for model: ${currentModel}`
        );
      } else {
        logger.info("📋 No model detected - no additional bits required");
      }
    } catch (error) {
      logger.error("❌ Error handling model-specific bits:", error);
      // Don't throw error - continue with cycle even if this fails
    }
  }

  // Reset model-specific bits after cycle completion
  async resetModelSpecificBits() {
    try {
      const currentModel = await this.getCurrentModelNumber();

      // Add timeout protection to prevent hanging
      const writeBitWithTimeout = async (
        register,
        bit,
        value,
        timeoutMs = 5000
      ) => {
        const writePromise = writeBit(register, bit, value);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `Timeout writing bit ${bit} to register ${register} after ${timeoutMs}ms`
                )
              ),
            timeoutMs
          );
        });
        return Promise.race([writePromise, timeoutPromise]);
      };

      if (currentModel === "FRONT_LEFT 1025969") {
        logger.info(
          "🔧 Resetting additional bit D1810.0 for FRONT_LEFT 1025969 model"
        );
        await writeBitWithTimeout(1810, 0, 0);
        logger.success("✅ Additional bit D1810.0 reset to OFF");
      } else if (currentModel === "FRONT_RIGHT 1025974") {
        logger.info(
          "🔧 Resetting additional bit D1810.1 for FRONT_RIGHT 1025974 model"
        );
        await writeBitWithTimeout(1810, 1, 0);
        logger.success("✅ Additional bit D1810.1 reset to OFF");
      } else if (currentModel) {
        // Reset D1810.2 for all other models
        logger.info(
          `🔧 Resetting additional bit D1810.2 for model: ${currentModel}`
        );
        await writeBitWithTimeout(1810, 2, 0);
        logger.success("✅ Additional bit D1810.2 reset to OFF");
      }
    } catch (error) {
      logger.error("❌ Error resetting model-specific bits:", error);
      // Don't throw error - continue with cleanup even if this fails
    }
  }

  // Reset all model-specific bits (used during general reset operations)
  async resetAllModelSpecificBits() {
    try {
      logger.info(
        "🔧 Resetting all model-specific bits D1810.0, D1810.1, D1810.2"
      );

      // Reset all three bits sequentially to avoid hanging
      // Add timeout protection to prevent hanging
      const writeBitWithTimeout = async (
        register,
        bit,
        value,
        timeoutMs = 5000
      ) => {
        const writePromise = writeBit(register, bit, value);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `Timeout writing bit ${bit} to register ${register} after ${timeoutMs}ms`
                )
              ),
            timeoutMs
          );
        });
        return Promise.race([writePromise, timeoutPromise]);
      };

      logger.info("🔧 Resetting bit D1810.0 to OFF...");
      await writeBitWithTimeout(1810, 0, 0);
      logger.info("🔧 Resetting bit D1810.1 to OFF...");
      await writeBitWithTimeout(1810, 1, 0);
      logger.info("🔧 Resetting bit D1810.2 to OFF...");
      await writeBitWithTimeout(1810, 2, 0);

      logger.success("✅ All model-specific bits reset to OFF");
    } catch (error) {
      logger.error("❌ Error resetting all model-specific bits:", error);
      // Don't throw error - continue with cleanup even if this fails
    }
  }

  // Helper methods for scan configuration
  getScanRegister(scanType) {
    switch (scanType) {
      case "first":
        return 1415;
      case "verification":
        return 1416;
      default:
        return 1415;
    }
  }

  getScanBit(scanType) {
    switch (scanType) {
      case "first":
        return 0;
      case "verification":
        return 15;
      default:
        return 0;
    }
  }

  getScanLabel(scanType) {
    switch (scanType) {
      case "first":
        return "First";
      case "verification":
        return "Verification";
      default:
        return "Scanner";
    }
  }

  async generateAndWriteBarcode(partNumber) {
    // Check for reset signal before generating barcode
    if (await this.checkReset()) {
      logger.warn(
        "⚠️ Reset detected during barcode generation, restarting cycle"
      );
      await sleep(1000);
      await this.saveToMongoDB({
        io: this.io,
        serialNumber: "",
        markingData: "",
        scannerData: "N/A",
        result: "NG",
        grading: "N/A",
        isUpdate: true,
      });
      return null;
    }

    try {
      logger.info("🏷️ Starting barcode generation process...");
      logger.info(`📦 Part Number: ${partNumber}`);

      // Generate barcode data using simplified method
      logger.info("🔄 Calling barcodeGenerator.generateBarcodeData...");
      const {
        text: barcodeText,
        serialNo: serialString,
        codeToPrint,
      } = await this.barcodeGenerator.generateBarcodeData({
        mongoDbService,
        partNumber,
      });
      logger.info(`✅ Barcode generated: ${barcodeText}`);
      logger.info(`🔢 Serial Number: ${serialString}`);

      // Write both files using the reusable function
      logger.info("📁 Writing barcode data to files...");
      await Promise.all([
        this.writeToFile(CODE_FILE_PATH, barcodeText, "Barcode text"),
        this.writeToFile(TEXT_FILE_PATH, codeToPrint, "Code to print"),
      ]);
      logger.info("✅ Files written successfully");

      // Emit marking data to UI
      if (this.io) {
        logger.info("📡 Emitting marking data to UI...");
        this.io.emit("marking_data", {
          timestamp: new Date(),
          data: barcodeText,
        });
      }

      logger.info("🔍 Verifying file write...");
      const isVerified = await this.verifyAndRetryWrite(barcodeText, 2);
      logger.info(`✅ File verification: ${isVerified ? "PASSED" : "FAILED"}`);

      // Save initial data to MongoDB (will check for duplicates and update if exists)
      if (isVerified) {
        logger.info("💾 Saving initial data to MongoDB...");
        await this.saveToMongoDB({
          io: this.io,
          serialNumber: serialString,
          markingData: barcodeText,
          scannerData: "N/A", // No scanner data at this point
          result: "N/A", // File write was successful
          grading: "N/A", // No grading at this point
          isUpdate: false, // Will check for duplicate and update if exists
        });
        logger.info("✅ MongoDB save completed");
      }

      logger.info(
        `🎯 Barcode generation process completed. Returning ${isVerified ? "barcodeData" : "null"}`
      );
      return isVerified ? { text: barcodeText, serialNo: serialString } : null;
    } catch (error) {
      logger.error("❌ Error in file writing process:", error);
      // Save error state to MongoDB
      await this.saveToMongoDB({
        io: this.io,
        serialNumber: "",
        markingData: "",
        scannerData: "N/A",
        result: "NG",
        grading: "N/A",
        isUpdate: true,
      });
      throw error;
    }
  }

  // Reusable file writing function
  async writeToFile(filePath, data, description = "Data") {
    try {
      await fs.writeFileSync(filePath, data.toString(), "utf8");
      logger.info(`✅ ${description} written to ${path.basename(filePath)}`);

      // Verify the write was successful
      const verificationData = await fs.readFileSync(filePath, "utf8");
      if (verificationData !== data.toString()) {
        throw new Error(
          `File verification failed for ${path.basename(filePath)}`
        );
      }

      return true;
    } catch (error) {
      logger.error(
        `❌ Error writing ${description.toLowerCase()} to ${path.basename(filePath)}:`,
        error
      );
      throw error;
    }
  }

  resetCycleCount() {
    this.cycleCount = 0;
    logger.info("Cycle count reset to 0");
  }

  getLastResetTime() {
    const now = new Date();
    const resetTime = new Date(now);

    // Use the reset time from SerialNumberGeneratorService if available
    const resetHour =
      this.barcodeGenerator?.serialNumberService?.resetHour || 6;
    const resetMinute =
      this.barcodeGenerator?.serialNumberService?.resetMinute || 0;

    resetTime.setHours(resetHour, resetMinute, 0, 0);

    // If current time is before reset time, set reset time to previous day
    if (now < resetTime) {
      resetTime.setDate(resetTime.getDate() - 1);
    }

    return resetTime;
  }

  async getCurrentDayId() {
    const now = new Date();
    const nextResetTime = new Date(this.lastResetDate);
    nextResetTime.setDate(nextResetTime.getDate() + 1);

    // Check if we need to reset the counter
    if (now >= nextResetTime) {
      this.currentDayId = 1;
      this.lastResetDate = this.getLastResetTime();
    }

    return this.currentDayId++;
  }

  async handleFirstScan(tcpScannerService) {
    logger.info("Starting first scan handler");

    const scannerData = await this.fetchScannerData(tcpScannerService, {
      scanType: "first",
    });

    // Check for reset signal before proceeding
    if (await this.checkReset()) {
      logger.warn("⚠️ Reset detected during first scan, restarting cycle");
      return { shouldContinue: false };
    }

    // Clean the scanner data to handle cases like "00\nNG" -> "NG"
    const cleanedData = this.cleanScannerData(scannerData);
    logger.info(
      `🧹 Original scanner data: "${scannerData}" -> Cleaned: "${cleanedData}"`
    );

    // Extract grade and main data using ": <grade>" format
    const { mainData, grade } = this.parseScannerPayload(scannerData);

    logger.info(
      `📊 Data breakdown: Main data: "${mainData}", Grade: "${grade}"`
    );

    // Handle timeout/null/undefined or explicit "NG" response
    if (
      !cleanedData ||
      cleanedData
        .replace(/[\r\n]+/g, "")
        .toUpperCase()
        .includes("NG")
    ) {
      logger.warn(
        "⚠️ First scan data is NG or timeout, proceeding with workflow"
      );
      logger.info("✍️ Writing bit 1414.7 to signal NG scan");
      await writeBit(1414, 7, 1);
      return { shouldContinue: true };
    }

    // If we get here and have valid scanner data, it means the part is already marked
    if (cleanedData && cleanedData.trim() !== "") {
      logger.warn("⚠️ Part appears to be already marked");

      // Emit the "part_already_marked" event to the UI with grade information
      if (this.io) {
        this.io.emit("first_scan_ok", {
          timestamp: new Date(),
          scannerData: mainData, // Send main data without grade
          grade: grade, // Send grade separately
          message:
            "Part detected with existing marking. Please use an unmarked part.",
        });
      }

      logger.info("✍️ Writing bit 1414.6 to signal OK scan");
      await writeBit(1414, 6, 1);
    }

    return { shouldContinue: false };
  }

  async initializeScannerAndMonitor(io, tcpScannerService) {
    if (!this.isInitialized) {
      logger.info("🔄 Starting scanner initialization...");
      await this.initialize();
    }

    // Debug logging
    logger.info("🔍 Debugging COM service state:");
    logger.info(
      `   - Provided comService: ${tcpScannerService ? "exists" : "null"}`
    );
    logger.info(
      `   - Internal comPortService: ${this.tcpScannerService ? "exists" : "null"}`
    );
    logger.info(`   - isInitialized: ${this.isInitialized}`);

    // Use the internally created comPortService if no external service provided
    if (tcpScannerService) {
      this.tcpScannerService = tcpScannerService;
      logger.info("🔗 Using provided COM service");
    } else {
      // Use the COM port service created during initialization
      if (!this.tcpScannerService) {
        throw new Error(
          "COM port service not initialized. Make sure initialize() completed successfully."
        );
      }
      logger.info("🔗 Using internal COM port service");
    }

    this.setupResetMonitor();
  }

  setupResetMonitor() {
    if (!this.resetMonitor) {
      this.resetMonitor = new Worker("./services/resetMonitor.js");
      this.resetMonitor.setMaxListeners(20);
    }

    this.cleanupResetListeners();

    this.resetMonitor.on("error", (error) => {
      logger.error("❌ Reset monitor error:", error);
    });

    this.resetMonitor.on("exit", (code) => {
      logger.warn(`Reset monitor exited with code ${code}`);
      this.cleanupResetListeners();
      if (code !== 0) {
        this.setupResetMonitor();
      }
    });
  }

  startResetMonitoring() {
    return new Promise((resolve) => {
      const messageHandler = async (message) => {
        if (message === "reset") {
          logger.warn("🔄 Reset signal detected from monitor");
          this.resetMonitor.removeListener("message", messageHandler);
          this.resetListeners.delete(messageHandler);
          await this.handleReset();
          resolve("RESET_DETECTED");
        }
      };

      this.resetListeners.add(messageHandler);
      this.resetMonitor.on("message", messageHandler);

      return () => {
        this.resetMonitor.removeListener("message", messageHandler);
        this.resetListeners.delete(messageHandler);
      };
    });
  }

  cleanupResetListeners() {
    if (this.resetMonitor) {
      this.resetMonitor.removeAllListeners("message");
      this.resetListeners.clear();
    }
  }

  async handleScanError(error) {
    logger.error("❌ Unexpected error in scanner workflow:", error);
    await this.handleError(error);
    await sleep(5000);
  }

  async handleReset() {
    try {
      logger.info("🔄 Handling reset signal");

      // Note: Model-specific bits are NOT reset during reset signals - they stay ON

      await writeBit(1500, 3, 1);
      await this.resetBits();
      this.barcodeGenerator.decSerialNo();
      throw new Error("RESET_DETECTED");
    } catch (error) {
      logger.error("❌ Error handling reset:", error);
      throw error;
    }
  }

  async performFinalChecks() {
    try {
      logger.info("🔍 Performing final checks...");
      if (await this.checkResetOrBit(1415, 7, 1)) {
        logger.warn("⚠️ Reset detected at final step, restarting cycle");
        await sleep(1000);
        return false;
      }

      await sleep(3 * 1000);
      return true;
    } catch (error) {
      logger.error("❌ Error in final checks:", error);
      throw error;
    }
  }

  async handleVerificationScan(tcpScannerService, barcodeData) {
    logger.info("Starting verification scan");

    try {
      const scannerData = await this.fetchScannerData(tcpScannerService, {
        scanType: "verification",
      });

      // Clean the scanner data to handle cases like "00\nNG" -> "NG"
      const cleanedData = this.cleanScannerData(scannerData);
      logger.info(
        `🧹 Original verification scanner data: "${scannerData}" -> Cleaned: "${cleanedData}"`
      );

      // Extract grade and main data for verification
      const { mainData, grade } = this.parseScannerPayload(scannerData);

      // Validate grade: only allow A or B
      const allowedGrades = ["A", "B"];
      const isGradeAllowed = allowedGrades.includes(
        (grade || "").toUpperCase()
      );

      logger.info(
        `📊 Verification data breakdown: Main data: "${mainData}", Grade: "${grade}"`
      );

      // Handle timeout/null/undefined cases as NG
      const effectiveScannerData = mainData || "NG"; // Use main data for comparison

      if (effectiveScannerData !== "NG") {
        logger.success("Verification scan OK");
      } else {
        logger.warn("⚠️ Verification scan NG or timeout");
      }

      // If grade is not allowed, we will still compute match for logging but force NG later
      const isDataMatching =
        await this.compareScannerDataWithCode(effectiveScannerData);

      // Signal grade status to PLC (1414.8 for OK grade, 1414.9 for NG grade)
      try {
        await writeBit(1414, isGradeAllowed ? 8 : 9, 1);
      } catch (e) {
        logger.warn(`Unable to write grade status bit: ${e.message}`);
      }

      // Final result: must match AND have allowed grade
      const isFinalOk = isDataMatching && isGradeAllowed;

      logger.info(
        `✍️ Writing bit 1414.${isFinalOk ? 3 : 4} to signal data match result (grade ${
          isGradeAllowed ? "OK" : "NG"
        })`
      );
      await writeBit(1414, isFinalOk ? 3 : 4, 1);

      if (isFinalOk) {
        logger.success("Verification OK: data matches and grade accepted ✅");
      } else if (!isGradeAllowed) {
        logger.warn(`⚠️ Verification NG: disallowed grade '${grade}'`);
      } else {
        logger.warn("⚠️ Verification NG: data does not match");
      }

      await this.saveToMongoDB({
        io: this.io,
        serialNumber: barcodeData.serialNo,
        markingData: barcodeData.text,
        scannerData: effectiveScannerData, // Main data without grade
        grading: grade, // Use extracted grade
        result: isFinalOk,
        isUpdate: true,
      });

      return { success: isFinalOk };
    } catch (error) {
      if (error.message === "RESET_DETECTED") {
        logger.warn(
          "Reset detected during verification scan, restarting cycle"
        );
        await this.handleReset();
        throw error;
      }
      throw error;
    }
  }

  // Remove testComPortCommunication (not needed for TCP scanner)

  async getCurrentModelNumber() {
    try {
      // Get current model from config collection
      await mongoDbService.connect("main-data", "config");
      const configData = await mongoDbService.collection.findOne({});

      if (
        configData &&
        configData.currentModelConfig &&
        configData.currentModelConfig.modelNumber
      ) {
        return configData.currentModelConfig.modelNumber;
      } else {
        logger.warn("No model configuration found");
        return null;
      }
    } catch (error) {
      logger.error("Error fetching current model number:", error);
      return null;
    }
  }
}

// Export singleton instance
export const scannerController = new ScannerController();
logger.success("Scanner controller module loaded");
