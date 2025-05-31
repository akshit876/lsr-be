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
import BufferedComPortService from "./ComPortService.js";

const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);

const CODE_FILE_PATH = path.join(__dirname, "../data/code.txt");
const TEXT_FILE_PATH = path.join(__dirname, "../data/text.txt");
export const sleep = promisify(setTimeout);

const TIMEOUT = 100 * 1000;

// COM Port configuration for RS-232 scanner
const COM_PORT_CONFIG = {
  path: "COM3", // Using COM3 as requested
  baudRate: 9600, // Changed to 9600 baud rate for scanner
  logDir: "scanner_logs",
  autoOpen: false, // Don't auto-open, we'll handle it manually
  lock: false, // Don't lock the port exclusively
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
    this.comPortService = null;
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

      // Initialize COM port for RS-232 scanner with better error handling
      logger.info("🔌 Setting up COM port for RS-232 scanner...");
      try {
        logger.info("🔍 Creating BufferedComPortService instance...");
        this.comPortService = new BufferedComPortService(COM_PORT_CONFIG);
        logger.info(
          `🔍 comPortService created: ${this.comPortService ? "exists" : "null"}`
        );

        logger.info("🔍 Calling initSerialPort...");
        await this.comPortService.initSerialPort();
        logger.info(
          `🔍 After initSerialPort - comPortService: ${this.comPortService ? "exists" : "null"}`
        );
        logger.success("COM port scanner connected successfully on COM3");
      } catch (comError) {
        logger.error(`🔍 COM port initialization failed: ${comError.message}`);
        // Set comPortService to null on error to make debugging easier
        this.comPortService = null;

        if (comError.message.includes("Access denied")) {
          logger.error(
            "❌ COM3 Access Denied Error - Troubleshooting suggestions:"
          );
          logger.error("   1. Run the application as Administrator");
          logger.error(
            "   2. Close any applications using COM3 (Arduino IDE, PuTTY, etc.)"
          );
          logger.error("   3. Check if another Node.js instance is running");
          logger.error("   4. Try unplugging and reconnecting the USB device");
          logger.error("   5. Check Device Manager for driver issues");

          // List available COM ports for user reference
          logger.info("💡 Available COM ports on this system:");
          logger.info("   - COM1: Communications Port");
          logger.info(
            "   - COM3: Prolific PL2303GT USB Serial (currently inaccessible)"
          );
        } else if (
          comError.message.includes("File not found") ||
          comError.message.includes("cannot open")
        ) {
          logger.error("❌ COM3 Not Found - Device may be disconnected");
          logger.error("   1. Check if USB-to-Serial device is connected");
          logger.error("   2. Verify the device shows up in Device Manager");
          logger.error("   3. Try a different USB port");
        }
        throw new Error(`COM Port Error: ${comError.message}`);
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

      if (this.comPortService) {
        logger.info("🔌 Closing COM port...");
        await this.comPortService.closePort();
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

  async checkResetOrBit(register, bit, value, timeout = 100 * 1000) {
    logger.info(`🧹 Waiting for bit ${register}.${bit} to become ${value}`);
    logger.info(
      "-----------------------------------------------------------------------------------------------------------"
    );

    let retryCount = 0;
    const maxRetries = 10; // Prevent infinite loop

    do {
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
        retryCount++;
        if (retryCount < maxRetries) {
          logger.info(
            `Retrying check for bit ${register}.${bit} (attempt ${retryCount + 1}/${maxRetries})`
          );
        }
      } catch (error) {
        logger.error(`Error in bit check: ${error.message}`);
        await sleep(1000);
        retryCount++;
      }
    } while (retryCount < maxRetries);

    logger.warn(
      `Maximum retries (${maxRetries}) reached for bit ${register}.${bit}`
    );
    return "timeout";
  }

  async singleCheckAttempt(register, bit, value, timeout) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        logger.warn(`⏰ Timeout after ${timeout / 1000} seconds`);
        resolve("timeout");
      }, timeout);

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
        mongoDbService.sendMongoDbDataToClient(io, "main-data", "records");
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

  async runContinuousScan(io = null, comService, { partNumber }) {
    this.io = io;
    this.currentPartNumber = partNumber;
    this.isRunning = true;
    // Don't reset cycle count here - let it persist across runs
    // this.cycleCount = 0;
    logger.info(
      `🔄 Starting continuous scan (current cycle count: ${this.cycleCount})`
    );

    try {
      await this.initializeScannerAndMonitor(io, comService);

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
            this.executeScanCycle(comService, partNumber),
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
  async executeScanCycle(comService, partNumber) {
    // First check for 1410.0 (start signal)
    logger.info("Waiting for start signal (1410.0)...");
    const resetResult = await this.checkResetOrBit(1410, 0, 1);
    if (resetResult === true) {
      logger.info("Reset detected, restarting cycle");
      return;
    }

    // Step 1: First Scanner Check
    const firstScanResult = await this.handleFirstScan(comService);
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
      comService,
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

  async fetchScannerData(comService, options = {}) {
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
          this.comPortService.off("dataGot", dataHandler);
        };

        // Set up event listener
        logger.info("👂 Adding event listener for scanner data");
        this.comPortService.on("dataGot", dataHandler);

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
            "   4. Verify scanner is configured for correct baud rate (9600)"
          );
          logger.error("   5. Test scanner with a simple terminal program");

          this.comPortService.off("dataGot", dataHandler);

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

        writeBit(register, bit, 1)
          .then(() => {
            logger.success(`${scannerLabel} scanner triggered successfully`);
            logger.info(
              `⏳ Waiting for scanner data on COM3... (timeout: ${timeout / 1000}s)`
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

  async handleFirstScan(comService) {
    logger.info("Starting first scan handler");

    const scannerData = await this.fetchScannerData(comService, {
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
        });
      }

      logger.info("✍️ Writing bit 1414.6 to signal OK scan");
      await writeBit(1414, 6, 1);
    }

    return { shouldContinue: false };
  }

  async initializeScannerAndMonitor(io, comService) {
    if (!this.isInitialized) {
      logger.info("🔄 Starting scanner initialization...");
      await this.initialize();
    }

    // Debug logging
    logger.info("🔍 Debugging COM service state:");
    logger.info(`   - Provided comService: ${comService ? "exists" : "null"}`);
    logger.info(
      `   - Internal comPortService: ${this.comPortService ? "exists" : "null"}`
    );
    logger.info(`   - isInitialized: ${this.isInitialized}`);

    // Use the internally created comPortService if no external service provided
    if (comService) {
      this.comPortService = comService;
      logger.info("🔗 Using provided COM service");
    } else {
      // Use the COM port service created during initialization
      if (!this.comPortService) {
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

  async handleVerificationScan(comService, barcodeData) {
    logger.info("Starting verification scan");

    try {
      const scannerData = await this.fetchScannerData(comService, {
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
