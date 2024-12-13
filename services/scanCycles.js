/* eslint-disable no-useless-catch */
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import logger from "../logger.js";
import mongoDbService from "./mongoDbService.js";
import {
  readBit,
  readRegister,
  writeBit,
  writeBitsWithRest,
  writeRegister,
} from "./modbus.js";
import ShiftUtility from "./ShiftUtility.js";
import BarcodeGenerator from "./barcodeGenrator.js";
import { promisify } from "util";
import fs from "fs";
import { format } from "date-fns";
import { Worker } from "worker_threads";
import serialNumberService from "./serialNumber.js";
import { REGISTERS_TO_MONITOR } from "../server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CODE_FILE_PATH = path.join(__dirname, "../data/code.txt");
export const sleep = promisify(setTimeout);

const TIMEOUT = 100 * 1000;
const BARCODE_RESET_HOUR = 6;
const BARCODE_RESET_MINUTE = 0;


const REGISTER_MONITORING_CONFIG = {
  register: 1700,
  interval: 100, // ms
  bits: {
    0: {
      eventName: "part-presence",
      message: "Part not present.............",
    },
    1: {
      eventName: "emergency-stop",
      message: "Emergency button pressed.............",
    },
    2: {
      eventName: "light-curtation",
      message: "Light curtain error.............",
    },
  },
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
    this.comService = null;
    this.isInitialized = false;
    this.shiftUtility = new ShiftUtility();
    this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
    this.setupShutdownHandlers();
    this.isRunning = false;
    this.cycleCount = 0;
    this.isPulseOn = false;
    this.safetyMonitorActive = false;
    this.lastSafetyStates = new Map();

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

      // Initialize barcode generator
      logger.info("🏷️ Setting up barcode generator...");
      this.shiftUtility = new ShiftUtility();
      await this.shiftUtility.initialize();
      this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
      await this.barcodeGenerator.initialize("main-data", "records");
      this.barcodeGenerator.setResetTime(
        BARCODE_RESET_HOUR,
        BARCODE_RESET_MINUTE
      );
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
    try {
      logger.info("🔄 Resetting bits...");

      // Perform both resets in parallel to be more efficient
      await Promise.all([
        this.resetSpecificBits(1414, [3, 4, 6, 7]),
        this.resetSpecificBits(1415, [4]),
      ]);

      // Add a small delay to ensure PLC has time to process
      await sleep(500);

      logger.success("Bits reset successfully");
    } catch (error) {
      logger.error("Error in resetBits:", error);
      throw error;
    }
  }

  async resetSpecificBits(register, bitsToReset) {
    try {
      logger.info(
        `🎯 Resetting bits ${bitsToReset.join(", ")} in register ${register}`
      );

      // Read current value once
      const [currentValue] = await readRegister(register, 1);

      // Create mask and calculate new value
      const mask = bitsToReset.reduce(
        (mask, bit) => mask & ~(1 << bit),
        0xffff
      );
      const newValue = currentValue & mask;

      // Write new value with timeout protection
      const writePromise = writeRegister(register, newValue);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Timeout resetting bits in register ${register}`)),
          5000
        )
      );

      await Promise.race([writePromise, timeoutPromise]);

      // Add a small delay to ensure PLC processes the write
      await sleep(50);

      logger.success(
        `Reset complete for bits ${bitsToReset.join(", ")} in register ${register}`
      );
    } catch (error) {
      logger.error(`Error resetting bits in register ${register}:`, error);
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
        this.cleanupResetListeners();
        await this.resetMonitor.terminate();
        this.resetMonitor = null;
      }

      if (this.comService) {
        logger.info("🔌 Closing COM port...");
        await this.comService.closePort();
      }

      logger.info("📦 Disconnecting from MongoDB...");
      await mongoDbService.disconnect();

      logger.info("🔄 Performing final bit reset...");
      await this.resetBits();

      this.safetyMonitorActive = false;
      this.lastSafetyStates.clear();

      logger.success("Cleanup completed successfully");
    } catch (error) {
      logger.separator.hash();
      logger.error("❌ Error during cleanup:", error);
      throw error;
    }
  }

  async checkResetOrBit(register, bit, value, timeout = 100 * 1000) {
    logger.info(`🧹 Waiting for bit ${register}.${bit} to become ${value}`);
    logger.info("-----------------------------------------------------------------------------------------------------------");

    // Start safety monitoring if not already running
    // if (!this.safetyMonitorActive) {
    //     this.startSafetyMonitoring();
    // }

    while (true) {
        try {
            const result = await this.singleCheckAttempt(register, bit, value, timeout);
            if (result !== "timeout") {
                return result;
            }
            logger.info(`Retrying check for bit ${register}.${bit}`);
        } catch (error) {
            logger.error(`Error in bit check: ${error.message}`);
            await sleep(1000);
        }
    }
}

  async singleCheckAttempt(register, bit, value, timeout) {
    return new Promise(async (resolve) => {
        let timeoutId;
        let resetCheckInterval;
        let bitCheckInterval;
        let checkCount = 0;
        const CHECK_INTERVAL = 10;

        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (resetCheckInterval) clearInterval(resetCheckInterval);
            if (bitCheckInterval) clearInterval(bitCheckInterval);
        };

          // Helper function to check and emit register bits
      const checkRegisterBits = async (registerConfig) => {
        const { register, bits } = registerConfig;
        for (const [bit, config] of Object.entries(bits)) {
          try {
            const bitValue = await readBit(register, parseInt(bit));
            
            // Emit event if bit is 1, regardless of previous state
            if (bitValue) {
              if (this.io) {
                this.io.emit(config.eventName, {
                  register,
                  bit: parseInt(bit),
                  value: bitValue,
                  message: config.message,
                  timestamp: new Date().toISOString()
                });
                logger.info(`${config.message} (Register ${register}.${bit})`);
              }
            }
          } catch (error) {
            logger.error(`Error checking register ${register} bit ${bit}:`, error);
          }
        }
      };

        // Main timeout
        timeoutId = setTimeout(() => {
            cleanup();
            logger.warn(`⏰ Timeout after ${timeout / 1000} seconds`);
            resolve("timeout");
        }, timeout);

           // Reset check interval
      resetCheckInterval = setInterval(async () => {
        try {
          const resetSignal = await readBit(1600, 0);
          if (resetSignal) {
            cleanup();
            logger.info("Reset signal (1600.0) detected");
            try {
              // await sleep(1200);
              // await this.resetBits();
              await writeBit(1500, 3, 1);
              logger.info("Reset bits completed, restarting cycle");
              // await sleep(1200);
              resolve(true);
            } catch (error) {
              logger.error("Error during reset bits:", error);
              resolve("timeout"); // Force timeout on reset error
            }
          }
        } catch (error) {
          logger.error(`Error checking reset signal: ${error.message}`);
        }
      }, CHECK_INTERVAL);

      // Bit check interval
      bitCheckInterval = setInterval(async () => {
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
    });
  }

  async writeOCRDataToFile(ocrDataString) {
    try {
      await this.clearCodeFile(CODE_FILE_PATH);
      fs.writeFileSync(CODE_FILE_PATH, ocrDataString, "utf8");
      logger.info("OCR data written to code.txt");

      // Emit marking data to UI
      if (this.io) {
        this.io.emit("marking_data", {
          timestamp: new Date(),
          data: ocrDataString,
        });
      }
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

  async saveToMongoDB({ io, serialNumber, markingData, scannerData, result }) {
    const now = new Date();
    const timestamp = format(now, "yyyy-MM-dd HH:mm:ss");

    try {
      // Fetch user details from the usersessionlogs collection
      const userDetails = await mongoDbService.getUserDetails();

      const data = {
        Timestamp: new Date(timestamp),
        SerialNumber: serialNumber,
        MarkingData: markingData,
        ScannerData: scannerData,
        Result: result ? "OK" : "NG",
        User: userDetails?.email || "Unknown",
      };

      await mongoDbService.insertRecord(data, "main-data", "records");
      logger.info("Data saved to MongoDB");

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
    this.cycleCount = 0;

    try {
      await this.initializeScannerAndMonitor(io, comService);

      // if (io) {
      //   io.on("connection", (socket) => {
      //     socket.on("pulse_on", () => {
      //       logger.info("📡 Received pulse_on signal from UI");
      //       this.isPulseOn = true;
      //     });

      //     socket.on("pulse_off", () => {
      //       logger.info("📡 Received pulse_off signal from UI");
      //       this.isPulseOn = false;
      //     });
      //   });
      // }

      while (this.isRunning) {
        try {
          // if (!this.isPulseOn) {
          //   logger.info("⏸️ Cycle paused - waiting for pulse_on signal");
          //   await sleep(1000);
          //   continue;
          // }

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

  setupResetMonitor() {
    if (!this.resetMonitor) {
      this.resetMonitor = new Worker("./services/resetMonitor.js");
      // Increase max listeners if needed
      this.resetMonitor.setMaxListeners(20);
    }

    // Clean up any existing listeners
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

  // New method to clean up listeners
  cleanupResetListeners() {
    if (this.resetMonitor) {
      this.resetMonitor.removeAllListeners("message");
      this.resetListeners.clear();
    }
  }

  startResetMonitoring() {
    return new Promise(async (resolve) => {
      const messageHandler = async (message) => {
        if (message === "reset") {
          logger.warn("🔄 Reset signal detected from monitor");
          this.resetMonitor.removeListener("message", messageHandler);
          this.resetListeners.delete(messageHandler);
          await this.handleReset();
          resolve("RESET_DETECTED");
        }
      };

      // Add to tracking set
      this.resetListeners.add(messageHandler);
      this.resetMonitor.on("message", messageHandler);

      // Cleanup when monitoring stops
      return () => {
        this.resetMonitor.removeListener("message", messageHandler);
        this.resetListeners.delete(messageHandler);
      };
    });
  }

  // New method to encapsulate the main scan cycle logic
  async executeScanCycle(comService, partNumber) {
    try {
      // First check for 1410.0
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

      // Step 2: Generate and Write Barcode
      const barcodeData = await this.generateAndWriteBarcode(partNumber);
      if (!barcodeData) {
        this.barcodeGenerator.decSerialNo();
        return;
      }

      // Step 3: Signal Transfer and Wait
      await this.signalFileTransfer();

      logger.info("✍️ Writing bit 1410.11 to signal file transfer");
      await writeBitsWithRest(1410, 11, 1, 100, false);

      logger.info("🔍 Checking for reset or waiting for bit 1410.2");
      if (await this.checkResetOrBit(1410, 2, 1)) {
        logger.warn(
          "⚠️ Reset detected while waiting for 1410.2, restarting cycle"
        );
        this.barcodeGenerator.decSerialNo();
        await sleep(1000);
        return;
      }

      // Step 4: Second Scanner Check
      const secondScanResult = await this.handleSecondScan(
        comService,
        barcodeData
      );

      // Step 5: Final Checks and Cleanup
      if (await this.performFinalChecks()) {
        this.cycleCount++;
        logger.section(`✅ Completed Scan Cycle ${this.cycleCount}`);
      }
    } catch (error) {
      throw error;
    }
  }

  // Helper methods to break down the complexity
  async initializeScannerAndMonitor(io, comService) {
    if (!this.isInitialized) {
      logger.info("🔄 Starting scanner initialization...");
      await this.initialize();
    }

    this.comService = comService;
    this.setupResetMonitor();
  }

  async handleFirstScan(comService) {
    logger.info("Starting first scan handler");

    const scannerData = await this.fetchScannerData(comService, {
      isSecondScan: false,
    });

    logger.info(`Received scanner data: "${scannerData}"`);

    // Check for reset signal before proceeding
    if (await this.checkReset()) {
      logger.warn("⚠️ Reset detected during first scan, restarting cycle");
      return { shouldContinue: false };
    }

    // If scannerData is "NG", proceed with workflow
    if (scannerData && scannerData.trim().toUpperCase() === "NG") {
      logger.warn("⚠️ First scan data is NG, proceeding with workflow");
      await writeBitsWithRest(1414, 7, 1, 100, false);
      return { shouldContinue: true };
    }

    // If scannerData is OK, emit socket event and restart cycle
    if (scannerData != null) {
      logger.info(
        "First scan data is OK, stopping machine and restarting cycle"
      );

      // Emit socket event if io is available
      if (this.io) {
        this.io.emit("first_scan_ok", {
          timestamp: new Date(),
          scannerData: scannerData,
          message: "First scan detected OK part, cycle restarting",
        });
      }

      await writeBitsWithRest(1414, 6, 1, 200, false);
      throw new Error("RESTART_CYCLE");
    }
    return {
      shouldContinue: false,
    };
  }

  async generateAndWriteBarcode(partNumber) {
    const { text, serialNo } = await this.barcodeGenerator.generateBarcodeData({
      date: new Date(),
      mongoDbService,
      partNumber,
    });

    // Check for reset signal before writing OCR data
    if (await this.checkReset()) {
      logger.warn(
        "⚠️ Reset detected during barcode generation, restarting cycle"
      );
      return null;
    }

    await this.writeOCRDataToFile(text);
    const isVerified = await this.verifyAndRetryWrite(text, 2);

    return isVerified ? { text, serialNo } : null;
  }

  async handleSecondScan(comService, barcodeData) {
    const secondScannerData = await this.fetchScannerData(comService, {
      isSecondScan: true,
    });
    const isDataMatching =
      await this.compareScannerDataWithCode(secondScannerData);

    await writeBitsWithRest(1414, isDataMatching ? 3 : 4, 1, 200, false);

    await this.saveToMongoDB({
      io: this.io,
      serialNumber: barcodeData.serialNo,
      markingData: barcodeData.text,
      scannerData: secondScannerData,
      result: isDataMatching,
    });

    return { success: isDataMatching };
  }

  async handleScanError(error) {
    logger.error("❌ Unexpected error in scanner workflow:", error);
    await this.handleError(error);
    await sleep(5000);
  }

  async handleError(error) {
    logger.section("Error Handler");
    logger.error("❌ Processing error:", error);

    try {
      // Add your error handling logic here
      logger.info("🔄 Attempting error recovery...");
    } catch (secondaryError) {
      logger.error("❌ Error during error handling:", secondaryError);
    }
  }

  async checkReset() {
    return new Promise((resolve) => {
      const resetHandler = async () => {
        await this.handleReset();
        this.resetMonitor.removeListener("reset", resetHandler);
        resolve(true);
      };
      this.resetMonitor.once("reset", resetHandler);
      setTimeout(() => {
        this.resetMonitor.removeListener("reset", resetHandler);
        resolve(false);
      }, 50);
    });
  }

  async fetchScannerData(comService, options = {}) {
    const {
      isSecondScan = false,
      register = isSecondScan ? 1416 : 1415,
      bit = isSecondScan ? 15 : 0,
      timeout = isSecondScan ? 100 * 1000 : 100 * 1000,
      scannerLabel = isSecondScan ? "Second" : "First",
    } = options;

    logger.section(`${scannerLabel} Scanner Data Acquisition`);

    // Add a flag to prevent multiple triggers
    if (this.isScanning) {
      logger.warn("Scanner already in progress, skipping new trigger");
      return null;
    }
    this.isScanning = true;

    try {
      logger.info(
        `🎯 Setting up data listener for ${scannerLabel.toLowerCase()} scan...`
      );

      const scannerDataPromise = new Promise((resolve, reject) => {
        // Remove any existing listeners first
        this.comService.removeAllListeners("dataGot");

        const dataHandler = (data) => {
          logger.success(
            `📥 Data received from ${scannerLabel.toLowerCase()} scanner: ${data}`
          );

          if (this.io) {
            this.io.emit("scanner_read", {
              timestamp: new Date(),
              scannerType: scannerLabel,
              data: data,
            });
          }

          clearTimeout(timeoutId);
          this.isScanning = false; // Reset the scanning flag
          resolve(data);
          this.comService.off("dataGot", dataHandler);
        };

        logger.info("👂 Adding event listener for scanner data");
        this.comService.on("dataGot", dataHandler);

        const timeoutId = setTimeout(() => {
          logger.error(
            `⏰ Timeout waiting for ${scannerLabel.toLowerCase()} scanner data`
          );
          this.comService.off("dataGot", dataHandler);
          this.isScanning = false; // Reset the scanning flag
          reject(new Error(`${scannerLabel} scanner data timeout`));
        }, timeout);

        // Only trigger scanner if not already scanning
        logger.info(`🔄 Triggering ${scannerLabel.toLowerCase()} scanner...`);
        writeBit(register, bit, 1)
          .then(() =>
            logger.success(`${scannerLabel} scanner triggered successfully`)
          )
          .catch((err) => {
            logger.error(
              `❌ Error triggering ${scannerLabel.toLowerCase()} scanner:`,
              err
            );
            clearTimeout(timeoutId);
            this.isScanning = false; // Reset the scanning flag
            reject(err);
          });
      });

      const result = await scannerDataPromise;
      return result;
    } catch (error) {
      logger.separator.hash();
      logger.error(
        `❌ Error acquiring ${scannerLabel.toLowerCase()} scanner data:`,
        error
      );
      throw error;
    } finally {
      this.isScanning = false; // Always reset the scanning flag
    }
  }

  async handleManualReset() {
    try {
      logger.section("Manual Serial Number Reset");
      logger.info("🔄 Manual reset triggered");

      const result = await serialNumberService.manualSerialNumberReset();
      logger.success(`Serial number reset to ${result.currentValue}`);

      return {
        success: true,
        currentValue: result.currentValue,
        resetTime: result.resetTime,
      };
    } catch (error) {
      logger.error("❌ Error during manual reset:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async updateResetTime(hour, minute) {
    try {
      logger.info(`Updating reset time to ${hour}:${minute}`);

      // Update the reset time in the barcode generator
      this.barcodeGenerator.setResetTime(hour, minute);

      logger.success("Reset time updated successfully");
      return { hour, minute };
    } catch (error) {
      logger.error("Error updating reset time:", error);
      throw error;
    }
  }

  async handleReset() {
    try {
      logger.info("🔄 Handling reset signal");
      await writeBit(1500, 3, 1);
      await this.resetBits();
      this.barcodeGenerator.decSerialNo(); // Decrement serial number if needed
      // await this.clearCodeFile(CODE_FILE_PATH);
      throw new Error("RESET_DETECTED");
    } catch (error) {
      logger.error("❌ Error handling reset:", error);
      throw error;
    }
  }

  async signalFileTransfer() {
    try {
      logger.info("🔄 Signaling file transfer...");
      await writeBitsWithRest(1414, 2, 1, 200, false);
      logger.success("File transfer signal sent");
    } catch (error) {
      logger.error("❌ Error signaling file transfer:", error);
      throw error;
    }
  }

  async performFinalChecks() {
    try {
      logger.info("🔍 Performing final checks...");
      if (await this.checkResetOrBit(1410, 12, 1)) {
        logger.warn("⚠️ Reset detected at final step, restarting cycle");
        await sleep(1000);
        return false;
      }

      logger.info("🧹 Clearing code file before next cycle");
      // await this.clearCodeFile(CODE_FILE_PATH);
      logger.success("Code file cleared successfully");

      await sleep(3 * 1000);
      return true;
    } catch (error) {
      logger.error("❌ Error in final checks:", error);
      throw error;
    }
  }

  resetCycleCount() {
    this.cycleCount = 0;
    logger.info("Cycle count reset to 0");
  }

  startSafetyMonitoring() {
    if (this.safetyMonitorActive) return;
    
    this.safetyMonitorActive = true;
    this.monitorSafety().catch(error => {
        logger.error('Safety monitoring error:', error);
        this.safetyMonitorActive = false;
    });
  }

  async monitorSafety() {
    while (this.safetyMonitorActive) {
        try {
            await new Promise(resolve => setImmediate(resolve));
            
            const registerValue = await readRegister(REGISTER_MONITORING_CONFIG.register, 1);
            
            for (const [bit, config] of Object.entries(REGISTER_MONITORING_CONFIG.bits)) {
                const bitValue = (registerValue[0] >> bit) & 1;
                
                // Emit only when bit is active (1)
                if (bitValue === 1) {
                    logger.warn(`Safety condition detected: ${config.message}`);
                    
                    if (this.io) {
                        this.io.emit(config.eventName, {
                            timestamp: new Date(),
                            message: config.message
                        });
                    }
                }
            }
            
            await sleep(REGISTER_MONITORING_CONFIG.interval);
            
        } catch (error) {
            logger.error('Error in safety monitoring cycle:', error);
            await sleep(1000);
        }
    }
  }
}

// Export singleton instance
export const scannerController = new ScannerController();
logger.success("Scanner controller module loaded");
