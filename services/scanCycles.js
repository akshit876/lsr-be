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
const SCANNER_TIMEOUT = 30 * 1000; // 30 seconds scanner timeout

// TCP Scanner configuration
const TCP_SCANNER_CONFIG = {
  host: process.env.SCANNER_HOST || "192.168.3.145", // Default TCP scanner IP
  port: parseInt(process.env.SCANNER_PORT, 10) || 502, // Default TCP scanner port
  timeout: 5000,
  reconnectInterval: 3000,
  keepAlive: true, // Enable keep-alive to prevent idle timeouts
  keepAliveInitialDelay: 1000,
  logDir: "scanner_logs",
};

// Middle Scanner configuration
const MIDDLE_SCANNER_CONFIG = {
  host: process.env.MIDDLE_SCANNER_HOST || "192.168.3.144", // Middle scanner IP
  port: parseInt(process.env.MIDDLE_SCANNER_PORT, 10) || 502, // Middle scanner port
  timeout: 5000,
  reconnectInterval: 3000,
  keepAlive: true,
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
    this.middleScannerService = null;
    this.isInitialized = false;
    this.shiftUtility = new ShiftUtility();
    this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
    this.setupShutdownHandlers();
    this.isRunning = false;
    this.cycleCount = 0;
    this.isPulseOn = false;
    this.currentDayId = 1;
    this.lastResetDate = this.getLastResetTime();

    // NEW: Add duplicate check cache
    this.duplicateCheckCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache timeout

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
            "   6. Verify scanner is listening on port ${TCP_SCANNER_CONFIG.port}"
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

      // Initialize Middle scanner connection
      logger.info("🔌 Setting up Middle scanner connection...");
      try {
        logger.info("🔍 Creating Middle TcpScannerService instance...");
        this.middleScannerService = new TcpScannerService(
          MIDDLE_SCANNER_CONFIG
        );
        logger.info(
          `🔍 middleScannerService created: ${this.middleScannerService ? "exists" : "null"}`
        );

        logger.info("🔍 Calling initTcpConnection for middle scanner...");
        await this.middleScannerService.initTcpConnection();
        logger.info(
          `🔍 After initTcpConnection - middleScannerService: ${this.middleScannerService ? "exists" : "null"}`
        );
        logger.success(
          `Middle scanner connected successfully at ${MIDDLE_SCANNER_CONFIG.host}:${MIDDLE_SCANNER_CONFIG.port}`
        );
      } catch (middleTcpError) {
        logger.error(
          `🔍 Middle scanner initialization failed: ${middleTcpError.message}`
        );
        // Set middleScannerService to null on error to make debugging easier
        this.middleScannerService = null;

        logger.info(`💡 Current Middle Scanner Configuration:`);
        logger.info(`   - Host: ${MIDDLE_SCANNER_CONFIG.host}`);
        logger.info(`   - Port: ${MIDDLE_SCANNER_CONFIG.port}`);
        logger.info(`   - Timeout: ${MIDDLE_SCANNER_CONFIG.timeout}ms`);

        throw new Error(`Middle Scanner Error: ${middleTcpError.message}`);
      }

      // Initialize barcode generator
      logger.info("🏷️ Setting up barcode generator...");
      this.shiftUtility = new ShiftUtility();
      this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
      await this.barcodeGenerator.initialize("main-data", "records");
      logger.success("Barcode generator initialized");

      // Create database indexes for better performance
      logger.info("🔧 Setting up database indexes...");
      await this.createDatabaseIndexes();

      // Enable debug logging for TCP scanners
      this.enableTcpScannerDebug();

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

      if (this.middleScannerService) {
        logger.info("🔌 Closing Middle scanner connection...");
        await this.middleScannerService.closeConnection();
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
      logger.error("📋 Failed data:", {
        serialNumber,
        markingData,
        scannerData,
        result,
        isUpdate,
      });

      // Check if it's a MongoDB connection issue
      if (
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("MongoNetworkError")
      ) {
        logger.error("❌ MongoDB connection issue detected");
        logger.error(
          "💡 Try restarting the application or check MongoDB service"
        );
      }

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
            this.executeScanCycle(this.tcpScannerService),
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
  async executeScanCycle(tcpScannerService) {
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

    // Step 2: Middle Scanner Check (New workflow)
    logger.info("🔄 Starting middle scan workflow...");
    const middleScanResult = await this.handleMiddleScan();
    if (!middleScanResult.shouldContinue) {
      if (middleScanResult.isDuplicate) {
        logger.warn("⚠️ Cycle stopped due to duplicate marking data");
      } else {
        logger.info("Cycle stopped after middle scan");
      }
      return;
    }

    // Use middle scan data as marking data
    const markingData = middleScanResult.markingData;
    const serialNumber = markingData || "N/A"; // Use marking data as serial number for now

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
        serialNumber: serialNumber,
        markingData: markingData,
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
      { text: markingData, serialNo: serialNumber }
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
      timeout = SCANNER_TIMEOUT, // Set timeout to 30 seconds
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

      // Clear any existing event listeners to prevent conflicts
      logger.info("🧹 Clearing any existing dataGot listeners...");
      logger.info(
        `🔍 Listeners before clearing: ${tcpScannerService.listenerCount("dataGot")}`
      );

      // Add a small delay before clearing to ensure no race conditions
      await sleep(50);
      tcpScannerService.removeAllListeners("dataGot");
      logger.info(
        `🔍 Listeners after clearing: ${tcpScannerService.listenerCount("dataGot")}`
      );

      // Clear any existing data buffer to prevent stale data
      if (tcpScannerService.clearBuffer) {
        logger.info("🧹 Clearing TCP scanner data buffer...");
        tcpScannerService.clearBuffer();
      }

      // Debug: Check TCP scanner service status
      if (tcpScannerService.getStatus) {
        const status = tcpScannerService.getStatus();
        logger.info(`🔍 TCP scanner status: ${JSON.stringify(status)}`);
      }

      const scannerData = await new Promise((resolve, reject) => {
        let isResolved = false;
        let timeoutId = null;

        const dataHandler = (data) => {
          if (isResolved) {
            logger.warn(
              "⚠️ Data handler called after already resolved, ignoring"
            );
            return;
          }

          isResolved = true;
          const dataReceiveTime = Date.now();
          logger.success(
            `📥 Data received from ${scannerLabel.toLowerCase()} scanner: ${data}`
          );
          logger.info(
            `🔍 Event listener called with data: "${data}" (type: ${typeof data})`
          );
          logger.info(
            `🔍 Current listener count when data received: ${tcpScannerService.listenerCount("dataGot")}`
          );
          logger.info(
            `⏰ Data received at: ${new Date(dataReceiveTime).toISOString()}`
          );
          logger.info(
            `⏰ Time since listener added: ${dataReceiveTime - listenerStartTime}ms`
          );

          // Clear timeout since we got data
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          // Remove listener after a small delay to ensure no race conditions
          setTimeout(() => {
            tcpScannerService.off("dataGot", dataHandler);
            logger.info(
              `🔍 Removed dataGot listener for ${scannerLabel} scanner`
            );
            logger.info(
              `🔍 Listener count after removal: ${tcpScannerService.listenerCount("dataGot")}`
            );
          }, 100);

          resolve(data);
        };

        // Set up event listener FIRST (before triggering scanner)
        logger.info("👂 Adding event listener for scanner data");
        const listenerStartTime = Date.now();
        tcpScannerService.on("dataGot", dataHandler);
        logger.info(
          `🔍 Event listener count after adding: ${tcpScannerService.listenerCount("dataGot")}`
        );
        logger.info(
          `⏰ Event listener added at: ${new Date(listenerStartTime).toISOString()}`
        );

        // Debug: Check if listener was added
        logger.info(
          `🔍 Event listener count for dataGot: ${tcpScannerService.listenerCount("dataGot")}`
        );

        // Configure timeout with better debugging
        timeoutId = setTimeout(() => {
          if (isResolved) {
            logger.warn(
              "⚠️ Timeout handler called after already resolved, ignoring"
            );
            return;
          }

          isResolved = true;
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

          // Remove listener after a small delay
          setTimeout(() => {
            tcpScannerService.off("dataGot", dataHandler);
            logger.info(
              `🔍 Removed dataGot listener for ${scannerLabel} scanner (timeout)`
            );
          }, 100);

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

        // Add small delay to ensure event listener is ready, then trigger scanner
        setTimeout(() => {
          writeBit(register, bit, 1)
            .then(() => {
              logger.success(`${scannerLabel} scanner triggered successfully`);
              logger.info(
                `⏳ Waiting for scanner data via TCP... (timeout: ${timeout / 1000}s)`
              );
            })
            .catch((err) => {
              if (isResolved) {
                logger.warn(
                  "⚠️ Error handler called after already resolved, ignoring"
                );
                return;
              }

              isResolved = true;
              logger.error(
                `❌ Error triggering ${scannerLabel.toLowerCase()} scanner:`,
                err
              );

              if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
              }

              setTimeout(() => {
                tcpScannerService.off("dataGot", dataHandler);
                logger.info(
                  `🔍 Removed dataGot listener for ${scannerLabel} scanner (error)`
                );
              }, 100);

              reject(err);
            });
        }, 100); // Small delay to ensure listener is ready
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

  // Helper methods for scan configuration
  getScanRegister(scanType) {
    switch (scanType) {
      case "first":
        return 1415;
      case "middle":
        return 1418;
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
      case "middle":
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
      case "middle":
        return "Middle";
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
      const { text: barcodeText, serialNo: serialString } =
        await this.barcodeGenerator.generateBarcodeData({
          mongoDbService,
          partNumber,
        });
      logger.info(`✅ Barcode generated: ${barcodeText}`);
      logger.info(`🔢 Serial Number: ${serialString}`);

      // Write both files using the reusable function
      logger.info("📁 Writing barcode data to files...");
      await Promise.all([
        this.writeToFile(CODE_FILE_PATH, barcodeText, "Barcode data"),
        this.writeToFile(TEXT_FILE_PATH, barcodeText, "Barcode text"),
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

    // Debug: Log the exact data received
    logger.info(
      `🔍 First scan received data: "${scannerData}" (type: ${typeof scannerData})`
    );
    logger.info(
      `🔍 Data trimmed: "${scannerData ? scannerData.trim() : "null"}"`
    );
    logger.info(
      `🔍 Is NG check: ${!scannerData || scannerData.trim().toUpperCase() === "NG"}`
    );

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

      logger.info("💾 Saving verification scan results to MongoDB...");
      logger.info(
        `📋 Save data: SerialNumber=${barcodeData.serialNo}, MarkingData=${barcodeData.text}, ScannerData=${effectiveScannerData}, Result=${isDataMatching}`
      );

      await this.saveToMongoDB({
        io: this.io,
        serialNumber: barcodeData.serialNo,
        markingData: barcodeData.text,
        scannerData: effectiveScannerData,
        grading: "N/A",
        result: isDataMatching,
        isUpdate: true, // Update existing record from middle scan
      });

      logger.success(
        "✅ Verification scan results updated in MongoDB successfully"
      );

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

  async fetchMiddleScannerData() {
    const { timeout = SCANNER_TIMEOUT, scannerLabel = "Middle" } = {};

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

      // Clear any existing event listeners to prevent conflicts
      logger.info(
        "🧹 Clearing any existing dataGot listeners for middle scanner..."
      );
      logger.info(
        `🔍 Listeners before clearing: ${this.middleScannerService.listenerCount("dataGot")}`
      );

      // Add a small delay before clearing to ensure no race conditions
      await sleep(50);
      this.middleScannerService.removeAllListeners("dataGot");
      logger.info(
        `🔍 Listeners after clearing: ${this.middleScannerService.listenerCount("dataGot")}`
      );

      // Clear any existing data buffer to prevent stale data
      if (this.middleScannerService.clearBuffer) {
        logger.info("🧹 Clearing middle TCP scanner data buffer...");
        this.middleScannerService.clearBuffer();
      }

      // Debug: Check middle scanner service status
      if (this.middleScannerService.getStatus) {
        const status = this.middleScannerService.getStatus();
        logger.info(`🔍 Middle scanner status: ${JSON.stringify(status)}`);
      }

      const scannerData = await new Promise((resolve, reject) => {
        let isResolved = false;
        let timeoutId = null;

        const dataHandler = (data) => {
          if (isResolved) {
            logger.warn(
              "⚠️ Middle scanner data handler called after already resolved, ignoring"
            );
            return;
          }

          isResolved = true;
          const dataReceiveTime = Date.now();
          logger.success(
            `📥 Data received from ${scannerLabel.toLowerCase()} scanner: ${data}`
          );
          logger.info(
            `🔍 Event listener called with data: "${data}" (type: ${typeof data})`
          );
          logger.info(
            `🔍 Current listener count when data received: ${this.middleScannerService.listenerCount("dataGot")}`
          );
          logger.info(
            `⏰ Data received at: ${new Date(dataReceiveTime).toISOString()}`
          );
          logger.info(
            `⏰ Time since listener added: ${dataReceiveTime - listenerStartTime}ms`
          );

          // Clear timeout since we got data
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          // Remove listener after a small delay to ensure no race conditions
          setTimeout(() => {
            this.middleScannerService.off("dataGot", dataHandler);
            logger.info(
              `🔍 Removed dataGot listener for ${scannerLabel} scanner`
            );
            logger.info(
              `🔍 Listener count after removal: ${this.middleScannerService.listenerCount("dataGot")}`
            );
          }, 100);

          resolve(data);
        };

        // Set up event listener FIRST (before triggering scanner)
        logger.info("👂 Adding event listener for middle scanner data");
        const listenerStartTime = Date.now();
        this.middleScannerService.on("dataGot", dataHandler);
        logger.info(
          `🔍 Event listener count after adding: ${this.middleScannerService.listenerCount("dataGot")}`
        );
        logger.info(
          `⏰ Event listener added at: ${new Date(listenerStartTime).toISOString()}`
        );

        // Debug: Check if listener was added
        logger.info(
          `🔍 Event listener count for dataGot: ${this.middleScannerService.listenerCount("dataGot")}`
        );

        // Configure timeout with better debugging
        timeoutId = setTimeout(() => {
          if (isResolved) {
            logger.warn(
              "⚠️ Middle scanner timeout handler called after already resolved, ignoring"
            );
            return;
          }

          isResolved = true;
          logger.error(
            `⏰ TIMEOUT: No data received from ${scannerLabel.toLowerCase()} scanner after ${timeout / 1000} seconds`
          );
          logger.error("🔍 Troubleshooting suggestions:");
          logger.error("   1. Check if middle scanner is powered on");
          logger.error(
            "   2. Verify scanner is reachable via network (ping test)"
          );
          logger.error("   3. Check if barcode is present for scanner to read");
          logger.error("   4. Test scanner with a simple TCP client");

          // Remove listener after a small delay
          setTimeout(() => {
            this.middleScannerService.off("dataGot", dataHandler);
            logger.info(
              `🔍 Removed dataGot listener for ${scannerLabel} scanner (timeout)`
            );
          }, 100);

          // Return "NG" on timeout and ensure proper bit handling
          logger.warn(
            "🔧 Middle scanner timeout - treating as NG to continue workflow"
          );
          resolve("NG");
        }, timeout);

        // Trigger middle scanner
        const register = this.getScanRegister("middle");
        const bit = this.getScanBit("middle");

        logger.info(`🔄 Triggering ${scannerLabel.toLowerCase()} scanner...`);
        logger.info(`📡 PLC Trigger: Register ${register}, Bit ${bit}`);

        // Add small delay to ensure event listener is ready, then trigger scanner
        setTimeout(() => {
          writeBit(register, bit, 1)
            .then(() => {
              logger.success(`${scannerLabel} scanner triggered successfully`);
              logger.info(
                `⏳ Waiting for middle scanner data via TCP... (timeout: ${timeout / 1000}s)`
              );
            })
            .catch((err) => {
              if (isResolved) {
                logger.warn(
                  "⚠️ Middle scanner error handler called after already resolved, ignoring"
                );
                return;
              }

              isResolved = true;
              logger.error(
                `❌ Error triggering ${scannerLabel.toLowerCase()} scanner:`,
                err
              );

              if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
              }

              setTimeout(() => {
                this.middleScannerService.off("dataGot", dataHandler);
                logger.info(
                  `🔍 Removed dataGot listener for ${scannerLabel} scanner (error)`
                );
              }, 100);

              reject(err);
            });
        }, 100); // Small delay to ensure listener is ready
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

  async handleMiddleScan() {
    logger.info("Starting middle scan handler");

    try {
      const scannerData = await this.fetchMiddleScannerData();

      // Check for reset signal before proceeding
      if (await this.checkReset()) {
        logger.warn("⚠️ Reset detected during middle scan, restarting cycle");
        return { shouldContinue: false, markingData: null };
      }

      // Handle timeout/null/undefined or explicit "NG" response
      if (!scannerData || scannerData.trim().toUpperCase() === "NG") {
        logger.warn(
          "⚠️ Middle scan data is NG or timeout, proceeding with workflow"
        );
        // Always save NG to MongoDB
        await this.saveToMongoDB({
          io: this.io,
          serialNumber: "NG",
          markingData: "NG",
          scannerData: "NG",
          result: "N/A",
          grading: "N/A",
          isUpdate: false,
        });
        // Emit marking data to UI (even for NG)
        if (this.io) {
          logger.info("📡 Emitting NG marking data to UI...");
          this.io.emit("marking_data", {
            timestamp: new Date(),
            data: "NG",
          });
        }
        return { shouldContinue: true, markingData: "NG" };
      }

      // Process the middle scan data - remove @ symbol if present
      let processedData = scannerData.trim();
      if (processedData.startsWith("@")) {
        processedData = processedData.substring(1);
        logger.info(
          `🔧 Removed @ symbol from middle scan data: ${processedData}`
        );
      }

      logger.success(
        `✅ Middle scan successful, marking data: ${processedData}`
      );

      // Check for duplicate marking data in MongoDB
      const duplicateCheck =
        await this.checkDuplicateMarkingDataCached(processedData);

      if (duplicateCheck.isDuplicate) {
        logger.warn("⚠️ Duplicate marking data detected - stopping workflow");
        logger.info("✍️ Writing bit 1414.6 to signal duplicate detected");
        await writeBit(1414, 6, 1);

        // Save duplicate detection to MongoDB
        await this.saveToMongoDB({
          io: this.io,
          serialNumber: processedData,
          markingData: processedData,
          scannerData: "N/A",
          result: "NG",
          grading: "N/A",
          isUpdate: false,
        });

        logger.info(`📋 Duplicate details:`);
        logger.info(`   - Total occurrences: ${duplicateCheck.duplicateCount}`);
        logger.info(
          `   - First occurrence: ${duplicateCheck.existingRecord.Timestamp}`
        );
        logger.info(
          `   - Serial Number: ${duplicateCheck.existingRecord.SerialNumber}`
        );
        logger.info(
          `   - Model Number: ${duplicateCheck.existingRecord.ModelNumber}`
        );
        logger.info(`   - Result: ${duplicateCheck.existingRecord.Result}`);
        logger.info(`   - User: ${duplicateCheck.existingRecord.User}`);

        // Emit duplicate detection event to UI with optimized information
        if (this.io) {
          this.io.emit("duplicate_marking_detected", {
            timestamp: new Date(),
            markingData: processedData,
            duplicateCount: duplicateCheck.duplicateCount,
            existingRecord: {
              serialNumber: duplicateCheck.existingRecord.SerialNumber,
              modelNumber: duplicateCheck.existingRecord.ModelNumber,
              timestamp: duplicateCheck.existingRecord.Timestamp,
              result: duplicateCheck.existingRecord.Result,
              user: duplicateCheck.existingRecord.User,
            },
            message: `Duplicate marking data detected - ${duplicateCheck.duplicateCount} occurrence(s) found in database`,
          });
        }

        return {
          shouldContinue: false,
          markingData: processedData,
          isDuplicate: true,
        };
      }

      // Write the middle scan data to files as marking data
      logger.info("📁 Writing middle scan data to files...");
      await Promise.all([
        this.writeToFile(CODE_FILE_PATH, processedData, "Middle scan data"),
        this.writeToFile(TEXT_FILE_PATH, processedData, "Middle scan text"),
      ]);
      logger.info("✅ Files written successfully");

      // Save middle scan data to MongoDB as first update
      logger.info("💾 Saving middle scan data to MongoDB as first update...");
      logger.info(
        `📋 First update data: SerialNumber=${processedData}, MarkingData=${processedData}, ScannerData=Middle Scan`
      );

      await this.saveToMongoDB({
        io: this.io,
        serialNumber: processedData,
        markingData: processedData,
        scannerData: "N/A",
        result: "N/A", // Will be updated after verification
        grading: "N/A",
        isUpdate: false, // Insert new record
      });

      logger.success("✅ Middle scan data saved to MongoDB as first update");

      // Emit marking data to UI
      if (this.io) {
        logger.info("📡 Emitting middle scan marking data to UI...");
        this.io.emit("marking_data", {
          timestamp: new Date(),
          data: processedData,
        });
      }

      return {
        shouldContinue: true,
        markingData: processedData,
        isDuplicate: false,
      };
    } catch (error) {
      logger.error("❌ Error in middle scan handler:", error);
      return { shouldContinue: false, markingData: null };
    }
  }

  // NEW: Cached duplicate check for better performance
  async checkDuplicateMarkingDataCached(markingData) {
    try {
      const now = Date.now();

      // Check cache first
      const cachedResult = this.duplicateCheckCache.get(markingData);
      if (cachedResult && now - cachedResult.timestamp < this.cacheTimeout) {
        logger.info("📋 Using cached duplicate check result");
        return { ...cachedResult.result, cacheHit: true };
      }

      // Perform actual check
      const result = await this.checkDuplicateMarkingData(markingData);

      // Cache the result
      this.duplicateCheckCache.set(markingData, {
        result: result,
        timestamp: now,
      });

      // Clean up old cache entries (keep only last 100 entries)
      if (this.duplicateCheckCache.size > 100) {
        const entries = Array.from(this.duplicateCheckCache.entries());
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        this.duplicateCheckCache.clear();
        entries.slice(0, 100).forEach(([key, value]) => {
          this.duplicateCheckCache.set(key, value);
        });
      }

      return result;
    } catch (error) {
      logger.error("❌ Error in cached duplicate check:", error);
      return { isDuplicate: false, existingRecord: null };
    }
  }

  // NEW: Performance monitoring for duplicate checks
  async checkDuplicateMarkingDataWithPerformance(markingData) {
    const startTime = Date.now();

    try {
      const result = await this.checkDuplicateMarkingDataCached(markingData);
      const duration = Date.now() - startTime;

      // Log performance metrics
      if (duration > 1000) {
        logger.warn(
          `⚠️ Slow duplicate check: ${duration}ms for marking data: ${markingData}`
        );
      } else if (duration > 500) {
        logger.info(
          `📊 Moderate duplicate check: ${duration}ms for marking data: ${markingData}`
        );
      } else {
        logger.debug(
          `📊 Fast duplicate check: ${duration}ms for marking data: ${markingData}`
        );
      }

      // Emit performance metrics to UI if available
      if (this.io) {
        this.io.emit("duplicate_check_performance", {
          timestamp: new Date(),
          markingData: markingData,
          duration: duration,
          isDuplicate: result.isDuplicate,
          cacheHit: result.cacheHit || false,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ Duplicate check failed after ${duration}ms:`, error);
      throw error;
    }
  }

  async checkDuplicateMarkingData(markingData) {
    try {
      logger.info("🔍 Checking for duplicate marking data in MongoDB...");
      logger.info(`📋 Marking data to check: ${markingData}`);

      if (!markingData || markingData === "NG" || markingData === "N/A") {
        logger.warn("⚠️ Invalid marking data, skipping duplicate check");
        return { isDuplicate: false, existingRecord: null };
      }

      // Connect to MongoDB and search for existing records with the same marking data
      await mongoDbService.connect("main-data", "records");

      // OPTIMIZATION: Use countDocuments instead of findOne for better performance
      // This avoids loading the full document into memory initially
      const duplicateCount = await mongoDbService.collection.countDocuments(
        {
          MarkingData: markingData,
        },
        { limit: 1 }
      ); // Limit to 1 for faster response

      if (duplicateCount > 0) {
        logger.warn("⚠️ DUPLICATE MARKING DATA DETECTED!");

        // Only fetch the first record for details (avoid loading all duplicates)
        const existingRecord = await mongoDbService.collection.findOne(
          {
            MarkingData: markingData,
          },
          {
            projection: {
              SerialNumber: 1,
              ModelNumber: 1,
              Timestamp: 1,
              Result: 1,
              User: 1,
            },
          }
        );

        logger.info(`📋 Duplicate details:`);
        logger.info(`   - Total occurrences: ${duplicateCount}`);
        logger.info(`   - First occurrence: ${existingRecord.Timestamp}`);
        logger.info(`   - Serial Number: ${existingRecord.SerialNumber}`);
        logger.info(`   - Model Number: ${existingRecord.ModelNumber}`);
        logger.info(`   - Result: ${existingRecord.Result}`);
        logger.info(`   - User: ${existingRecord.User}`);

        // Emit duplicate detection event to UI with optimized information
        if (this.io) {
          this.io.emit("duplicate_marking_detected", {
            timestamp: new Date(),
            markingData: markingData,
            duplicateCount: duplicateCount,
            existingRecord: {
              serialNumber: existingRecord.SerialNumber,
              modelNumber: existingRecord.ModelNumber,
              timestamp: existingRecord.Timestamp,
              result: existingRecord.Result,
              user: existingRecord.User,
            },
            message: `Duplicate marking data detected - ${duplicateCount} occurrence(s) found in database`,
          });
        }

        return { isDuplicate: true, existingRecord, duplicateCount };
      } else {
        logger.success(
          "✅ No duplicate marking data found - proceeding with workflow"
        );
        return { isDuplicate: false, existingRecord: null };
      }
    } catch (error) {
      logger.error("❌ Error checking for duplicate marking data:", error);
      // Return false to allow workflow to continue even if check fails
      return { isDuplicate: false, existingRecord: null };
    }
  }

  async getDuplicateStatistics(markingData) {
    try {
      logger.info("📊 Getting duplicate statistics for marking data...");

      if (!markingData || markingData === "NG" || markingData === "N/A") {
        return { count: 0, records: [], totalCount: 0 };
      }

      await mongoDbService.connect("main-data", "records");

      // OPTIMIZATION: Use countDocuments for fast count
      const count = await mongoDbService.collection.countDocuments({
        MarkingData: markingData,
      });

      if (count > 0) {
        logger.info(
          `📊 Found ${count} duplicate record(s) for marking data: ${markingData}`
        );

        // OPTIMIZATION: Only fetch limited records for display (max 10)
        const maxDisplayRecords = 10;
        const duplicateRecords = await mongoDbService.collection
          .find(
            {
              MarkingData: markingData,
            },
            {
              projection: {
                SerialNumber: 1,
                ModelNumber: 1,
                Timestamp: 1,
                Result: 1,
                User: 1,
              },
              sort: { Timestamp: -1 }, // Most recent first
              limit: maxDisplayRecords,
            }
          )
          .toArray();

        // Log details of each duplicate (limited display)
        duplicateRecords.forEach((record, index) => {
          logger.info(
            `   ${index + 1}. Serial: ${record.SerialNumber}, Model: ${record.ModelNumber}, Result: ${record.Result}, Date: ${record.Timestamp}`
          );
        });

        if (count > maxDisplayRecords) {
          logger.info(
            `   ... and ${count - maxDisplayRecords} more records (display limited to ${maxDisplayRecords})`
          );
        }

        return { count, records: duplicateRecords, totalCount: count };
      }

      return { count: 0, records: [], totalCount: 0 };
    } catch (error) {
      logger.error("❌ Error getting duplicate statistics:", error);
      return { count: 0, records: [], totalCount: 0 };
    }
  }

  // NEW: Method to create database indexes for better performance
  async createDatabaseIndexes() {
    try {
      logger.info("🔧 Creating database indexes for better performance...");

      await mongoDbService.connect("main-data", "records");

      // Create index on MarkingData field for fast duplicate checks
      await mongoDbService.collection.createIndex(
        { MarkingData: 1 },
        {
          name: "marking_data_index",
          background: true,
          unique: false, // Allow duplicates for detection purposes
        }
      );

      // Create compound index for common queries
      await mongoDbService.collection.createIndex(
        { MarkingData: 1, Timestamp: -1 },
        {
          name: "marking_data_timestamp_index",
          background: true,
        }
      );

      // Create index on SerialNumber for fast lookups
      await mongoDbService.collection.createIndex(
        { SerialNumber: 1 },
        {
          name: "serial_number_index",
          background: true,
        }
      );

      logger.success("✅ Database indexes created successfully");
    } catch (error) {
      logger.error("❌ Error creating database indexes:", error);
      // Don't throw error - indexes are optional for performance
    }
  }

  // NEW: Method to enable debug logging for TCP scanners
  enableTcpScannerDebug() {
    logger.info("🔧 Enabling debug logging for TCP scanners...");

    if (this.tcpScannerService && this.tcpScannerService.setDebugLevel) {
      this.tcpScannerService.setDebugLevel(true);
      logger.info("✅ Debug logging enabled for main TCP scanner");
    }

    if (this.middleScannerService && this.middleScannerService.setDebugLevel) {
      this.middleScannerService.setDebugLevel(true);
      logger.info("✅ Debug logging enabled for middle TCP scanner");
    }
  }
}

// Export singleton instance
export const scannerController = new ScannerController();
logger.success("Scanner controller module loaded");
