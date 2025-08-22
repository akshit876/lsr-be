import { fileURLToPath } from "url";
import path, { dirname } from "path";
import logger from "../logger.js";
import mongoDbService from "./mongoDbService.js";
import {
  readBit,
  readRegister,
  writeBit,
  writeRegister,
  writeRegisterFull,
} from "./modbus.js";
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
  port: parseInt(process.env.SCANNER_PORT, 10) || 502, // Default TCP scanner port
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
        logger.info(
          `🔍 tcpScannerService created: ${this.tcpScannerService ? "exists" : "null"}`
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
          timeout
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

  async singleCheckAttempt(register, bit, value, timeout) {
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
      const CHECK_INTERVAL = 1000;

      // Define registers to monitor for safety
      const REGISTERS_TO_MONITOR = [
        { register: 1490, bit: 0, name: "Part Present", expectedValue: 1 },
        { register: 1490, bit: 1, name: "Emergency Stop", expectedValue: 0 },
        { register: 1490, bit: 2, name: "Safety Sensor", expectedValue: 1 },
      ];

      // Function to check register bits and emit UI events
      const checkRegisterBits = async (registerConfig) => {
        try {
          const bitValue = await readBit(
            registerConfig.register,
            registerConfig.bit
          );
          const currentValue = Number(bitValue);
          const expectedValue = Number(registerConfig.expectedValue);

          // Check if safety condition is violated - ONLY emit for actual violations, not for normal 0 values
          if (currentValue !== expectedValue) {
            let violationMessage = "";
            let details = "";

            // Only emit events for actual safety violations, not for normal 0 states
            if (registerConfig.name === "Part Present" && currentValue === 0) {
              // Part not present (1490.0 = 0) - this is a violation
              violationMessage = "Part not present";
              details =
                "🚨 SAFETY VIOLATION: Part not present - Please check part placement";
            } else if (
              registerConfig.name === "Emergency Stop" &&
              currentValue === 1
            ) {
              // Emergency stop activated (1490.1 = 1) - this is a violation
              violationMessage = "Emergency stop activated";
              details =
                "🚨 SAFETY VIOLATION: Emergency stop activated - Please check emergency stop button";
            } else if (
              registerConfig.name === "Safety Sensor" &&
              currentValue === 0
            ) {
              // Safety sensor interrupted (1490.2 = 0) - this is a violation
              violationMessage = "Safety sensor interrupted";
              details =
                "🚨 SAFETY VIOLATION: Safety sensor interrupted - Please check safety sensors";
            }

            // Only emit events for actual violations
            if (violationMessage && this.io) {
              logger.error(
                `🚨 SAFETY VIOLATION: ${violationMessage} (${registerConfig.register}.${registerConfig.bit} = ${currentValue})`
              );
              this.io.emit("validation_error", {
                timestamp: new Date().toISOString(),
                details: details,
                violation: violationMessage,
                cycleNumber: this.cycleCount,
                isActive: true,
              });
            }
          }
        } catch (error) {
          logger.error(
            `Error checking register ${registerConfig.register}.${registerConfig.bit}: ${error.message}`
          );
        }
      };

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
      };

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

          // Check all monitored registers
          for (const registerConfig of REGISTERS_TO_MONITOR) {
            await checkRegisterBits(registerConfig);
          }

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

          // Initial check of all monitored registers
          for (const registerConfig of REGISTERS_TO_MONITOR) {
            await checkRegisterBits(registerConfig);
          }

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
        Grade: grading?.toUpperCase(),
        CurrentId: currentId,
      };

      if (isUpdate) {
        // Find and update the most recent record for this serial number AND model
        logger.info(
          `🔄 Attempting to update record for SerialNumber: ${serialNumber}, Model: ${modelNumber}`
        );
        logger.info(
          `📊 Update data: ScannerData=${scannerData}, Result=${result}`
        );

        const updateResult = await mongoDbService.updateLastRecord(
          { SerialNumber: serialNumber, ModelNumber: modelNumber },
          { $set: data },
          "main-data",
          "records"
        );

        if (updateResult) {
          logger.info(
            `✅ Successfully updated MongoDB record for SerialNumber: ${serialNumber}, Model: ${modelNumber}`
          );
          logger.info(`📋 Updated fields: ${JSON.stringify(data)}`);
        } else {
          logger.warn(
            `⚠️ Failed to find/update record for SerialNumber: ${serialNumber}, Model: ${modelNumber}`
          );
          logger.warn(`🔍 Trying to insert as new record instead`);
          await mongoDbService.insertRecord(data, "main-data", "records");
        }
      } else {
        // Insert new record
        logger.info(
          `📝 Inserting new record for SerialNumber: ${serialNumber}, Model: ${modelNumber}`
        );
        await mongoDbService.insertRecord(data, "main-data", "records");
        logger.info(
          `✅ Data saved to MongoDB with CurrentId: ${currentId}, Model: ${modelNumber}`
        );
      }

      if (io) {
        // Use broadcast method to refresh all connected clients
        mongoDbService.broadcastDataToAllClients(io, "main-data", "records");
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
    // Don't reset cycle count here - let it persist across runs
    // this.cycleCount = 0;
    logger.info(
      `🔄 Starting continuous scan (current cycle count: ${this.cycleCount})`
    );

    try {
      await this.initializeScannerAndMonitor(io, this.tcpScannerService);

      while (this.isRunning) {
        try {
          await sleep(1200);

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
          if (error.message === "SAFETY_VIOLATION") {
            logger.error(
              "🚨 SAFETY VIOLATION - Stopping all cycles immediately"
            );
            this.isRunning = false;
            // Emit validation_error event for safety violations
            if (this.io) {
              this.io.emit("validation_error", {
                timestamp: new Date().toISOString(),
                details:
                  "🚨 SAFETY VIOLATION: System stopped due to safety violation - Please check all safety conditions",
                violation: "System stopped - safety violation",
                cycleNumber: this.cycleCount,
              });
            }
            throw error; // Re-throw to stop the entire process
          } else if (error.message === "RESET_DETECTED") {
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
      await sleep(1000);
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
      timeout = 30 * 1000, // Reduced timeout for faster debugging
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

      // Process ALL scanner data received (including NG, empty, or any other data)
      // This ensures every scan attempt gets processed and logged
      try {
        await this.handleSuccessfulScan(scannerData, scanType);
        logger.success(
          `✅ Scanner data processed successfully: ${scannerData}`
        );
      } catch (scanError) {
        logger.error(`❌ Error processing scanner data: ${scanError.message}`);
        // Continue with the workflow even if PLC write or file save fails
      }

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
        textFileContent,
      } = await this.barcodeGenerator.generateBarcodeData({
        mongoDbService,
        partNumber,
      });
      logger.info(`✅ Barcode generated: ${barcodeText}`);
      logger.info(`🔢 Serial Number: ${serialString}`);
      logger.info(`📄 Text file content: ${textFileContent}`);

      // Write both files using the reusable function
      logger.info("📁 Writing barcode data to files...");

      await Promise.all([
        this.writeToFile(CODE_FILE_PATH, barcodeText, "Barcode data"),
        this.writeToFile(
          TEXT_FILE_PATH,
          textFileContent,
          "Text file with format"
        ),
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

      // Add MongoDB write after file verification
      if (isVerified) {
        logger.info("💾 Saving initial data to MongoDB...");
        await this.saveToMongoDB({
          io: this.io,
          serialNumber: serialString,
          markingData: barcodeText,
          scannerData: "N/A", // No scanner data at this point
          result: "N/A", // File write was successful
          grading: "N/A", // No grading at this point
          isUpdate: false,
        });
        logger.info("✅ MongoDB save completed");
      }

      logger.info(
        `🎯 Barcode generation process completed. Returning ${isVerified ? "barcodeData" : "null"}`
      );
      return isVerified
        ? {
            text: barcodeText,
            serialNo: serialString,
            textFileContent: textFileContent,
          }
        : null;
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
      this.barcodeGenerator?.serialNumberService?.resetHour || 0;
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

    // Handle timeout/null/undefined or explicit "NG" response
    if (!scannerData || scannerData.trim().toUpperCase() === "NG") {
      logger.warn(
        "⚠️ First scan data is NG or timeout, proceeding with workflow"
      );
      logger.info("✍️ Writing bit 1414.7 to signal NG scan");
      await writeBit(1414, 7, 1);
      return { shouldContinue: true };
    }

    // If we get here and have valid scanner data, it means the part is already marked
    if (scannerData && scannerData.trim() !== "") {
      logger.warn("⚠️ Part appears to be already marked");

      // Emit the "part_already_marked" event to the UI
      if (this.io) {
        this.io.emit("first_scan_ok", {
          timestamp: new Date(),
          scannerData: scannerData,
          message:
            "Part detected with existing marking. Please use an unmarked part.",
          violation: "Part already marked",
          cycleNumber: this.cycleCount,
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
    logger.info("🔍 Debugging TCP scanner service state:");
    logger.info(
      `   - Provided tcpScannerService: ${tcpScannerService ? "exists" : "null"}`
    );
    logger.info(
      `   - Internal tcpScannerService: ${this.tcpScannerService ? "exists" : "null"}`
    );
    logger.info(`   - isInitialized: ${this.isInitialized}`);

    // Use the internally created tcpScannerService if no external service provided
    if (tcpScannerService) {
      this.tcpScannerService = tcpScannerService;
      logger.info("🔗 Using provided TCP scanner service");
    } else {
      // Use the TCP scanner service created during initialization
      if (!this.tcpScannerService) {
        throw new Error(
          "TCP scanner service not initialized. Make sure initialize() completed successfully."
        );
      }
      logger.info("🔗 Using internal TCP scanner service");
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

      // Handle timeout/null/undefined cases as NG
      const effectiveScannerData = scannerData || "NG";

      if (effectiveScannerData !== "NG") {
        logger.success("Verification scan OK");
      } else {
        logger.warn("⚠️ Verification scan NG or timeout");
      }

      const isDataMatching =
        await this.compareScannerDataWithCode(effectiveScannerData);

      logger.info(
        `✍️ Writing bit 1414.${isDataMatching ? 3 : 4} to signal data match result`
      );
      await writeBit(1414, isDataMatching ? 3 : 4, 1);

      if (isDataMatching) {
        logger.success("Data matches ✅");
      } else {
        logger.warn("⚠️ Data does not match");
      }

      await this.saveToMongoDB({
        io: this.io,
        serialNumber: barcodeData.serialNo,
        markingData: barcodeData.text,
        scannerData: effectiveScannerData,
        grading: "N/A",
        result: isDataMatching,
        isUpdate: true,
      });

      return { success: isDataMatching };
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

  async handleSuccessfulScan(scannerData, scanType) {
    try {
      logger.info(`🎯 Processing ${scanType} scan data: ${scannerData}`);

      // Always write scanner data to multiple PLC registers starting from 3000
      // Even if data is "NG" or empty, we still want to record the scan attempt
      logger.info(
        "📡 Writing scanner data to multiple PLC registers starting from 3000..."
      );

      // Try to write to PLC registers, but don't let failures stop file writing
      try {
        await this.writeScannerDataToMultipleRegisters(scannerData);
        logger.success(
          `✅ Scanner data "${scannerData}" written to multiple PLC registers starting from 3000`
        );
      } catch (plcError) {
        logger.error(
          `❌ PLC write failed, but continuing with file save: ${plcError.message}`
        );
        // Continue with file writing even if PLC fails
      }

      // Always save scanner data to scan_data.txt file in D directory (override each time)
      // This ensures we have a record of every scan attempt
      const fileName = "scan_data.txt";
      const filePath = `D:/${fileName}`;

      try {
        // Write the scanner data (override the file each time)
        // Use "NG" if scannerData is null/undefined, or the actual data
        const dataToWrite = scannerData || "NG";
        await fs.writeFileSync(filePath, dataToWrite, "utf8");
        logger.success(
          `✅ Scanner data "${dataToWrite}" written to ${filePath}`
        );

        // Emit event to UI
        if (this.io) {
          this.io.emit("scan_data_saved", {
            timestamp: new Date(),
            scanType: scanType,
            data: dataToWrite,
            filePath: filePath,
          });
        }
      } catch (fileError) {
        logger.error(
          `❌ Error saving scanned data to file: ${fileError.message}`
        );
        // Try alternative path if D: drive is not accessible
        const altPath = `./${fileName}`;
        try {
          const dataToWrite = scannerData || "NG";
          await fs.writeFileSync(altPath, dataToWrite, "utf8");
          logger.success(
            `✅ Scanner data "${dataToWrite}" written to alternative path: ${altPath}`
          );
        } catch (altError) {
          logger.error(
            `❌ Error saving to alternative path: ${altError.message}`
          );
        }
      }
    } catch (error) {
      logger.error(`❌ Error handling scan data: ${error.message}`);
      throw error;
    }
  }

  async writeScannerDataToMultipleRegisters(scannerData) {
    try {
      const START_REGISTER = 3000;
      const CHARS_PER_REGISTER = 2; // Each 16-bit register can hold 2 characters (8 bits per char)

      // Configuration: Set to true if PLC reads bytes in reverse order (little-endian)
      const REVERSE_BYTE_ORDER = true; // Change this to true if data appears in reverse order

      // Convert scanner data to string and handle edge cases
      const dataString = (scannerData || "NG").toString();
      logger.info(`📊 Scanner data length: ${dataString.length} characters`);
      logger.info(
        `🔧 Byte order: ${REVERSE_BYTE_ORDER ? "REVERSE (little-endian)" : "NORMAL (big-endian)"}`
      );

      // Calculate how many registers we need
      const numRegisters = Math.ceil(dataString.length / CHARS_PER_REGISTER);
      logger.info(`🔢 Number of registers needed: ${numRegisters}`);

      // Split data into chunks for each register
      const registerValues = [];
      for (let i = 0; i < numRegisters; i++) {
        const startIndex = i * CHARS_PER_REGISTER;
        const endIndex = startIndex + CHARS_PER_REGISTER;
        const chunk = dataString.slice(startIndex, endIndex);

        // Convert chunk to register value (16-bit integer)
        let registerValue = 0;
        if (chunk.length === 2) {
          // Two characters: pack them into 16 bits
          const char1 = chunk.charCodeAt(0);
          const char2 = chunk.charCodeAt(1);

          if (REVERSE_BYTE_ORDER) {
            // Reverse byte order: char2 in high byte, char1 in low byte
            registerValue = (char2 << 8) | char1;
            logger.info(
              `📝 Register ${START_REGISTER + i}: "${chunk}" → REVERSE: char2(${chunk[1]}=${char2}) << 8 | char1(${chunk[0]}=${char1}) = ${registerValue} (0x${registerValue.toString(16).toUpperCase()})`
            );
          } else {
            // Normal byte order: char1 in high byte, char2 in low byte
            registerValue = (char1 << 8) | char2;
            logger.info(
              `📝 Register ${START_REGISTER + i}: "${chunk}" → NORMAL: char1(${chunk[0]}=${char1}) << 8 | char2(${chunk[1]}=${char2}) = ${registerValue} (0x${registerValue.toString(16).toUpperCase()})`
            );
          }
        } else if (chunk.length === 1) {
          // Single character: just use its ASCII value
          registerValue = chunk.charCodeAt(0);
          logger.info(
            `📝 Register ${START_REGISTER + i}: "${chunk}" → single char ${chunk[0]}=${registerValue} (0x${registerValue.toString(16).toUpperCase()})`
          );
        }

        registerValues.push(registerValue);
      }

      // Write all registers at once using writeRegisterFull
      await writeRegisterFull(START_REGISTER, registerValues);
      logger.success(
        `✅ Successfully wrote ${numRegisters} registers starting from ${START_REGISTER}`
      );

      // Also write the total number of registers used to a status register (e.g., 2999)
      await writeRegister(2999, numRegisters);
      logger.info(
        `📊 Status register 2999 updated with number of registers used: ${numRegisters}`
      );

      // Log the expected reading order for debugging
      logger.info("\n📖 Expected PLC Reading Order:");
      logger.info("=".repeat(50));
      for (let i = 0; i < numRegisters; i++) {
        const startIndex = i * CHARS_PER_REGISTER;
        const endIndex = startIndex + CHARS_PER_REGISTER;
        const chunk = dataString.slice(startIndex, endIndex);

        if (REVERSE_BYTE_ORDER) {
          logger.info(
            `Register ${START_REGISTER + i}: Should read as "${chunk.split("").reverse().join("")}" (REVERSE order)`
          );
        } else {
          logger.info(
            `Register ${START_REGISTER + i}: Should read as "${chunk}" (NORMAL order)`
          );
        }
      }
    } catch (error) {
      logger.error(
        `❌ Error writing scanner data to multiple registers: ${error.message}`
      );
      throw error;
    }
  }

  // Test method to verify COM port communication
  async testComPortCommunication() {
    logger.section("COM Port Communication Test");

    if (!this.comPortService) {
      logger.error("❌ COM port service not available");
      return false;
    }

    try {
      logger.info("🔍 Testing COM port communication...");
      logger.info("📡 Listening for any data on COM3 for 10 seconds...");

      return new Promise((resolve) => {
        let testComplete = false;

        const testHandler = (data) => {
          if (!testComplete) {
            logger.success(`✅ COM3 Data received: "${data}"`);
            this.comPortService.off("dataGot", testHandler);
            testComplete = true;
            resolve(true);
          }
        };

        this.comPortService.on("dataGot", testHandler);

        // 10 second timeout
        setTimeout(() => {
          if (!testComplete) {
            logger.warn("⚠️ No data received on COM3 during test period");
            logger.info("💡 This suggests:");
            logger.info("   - Scanner may not be sending data automatically");
            logger.info("   - Scanner may need manual trigger (scan button)");
            logger.info(
              "   - Scanner may be configured for different baud rate"
            );
            logger.info("   - Scanner may require specific trigger sequence");
            this.comPortService.off("dataGot", testHandler);
            testComplete = true;
            resolve(false);
          }
        }, 10000);
      });
    } catch (error) {
      logger.error("❌ Error during COM port test:", error);
      return false;
    }
  }

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
