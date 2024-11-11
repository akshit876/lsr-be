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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CODE_FILE_PATH = path.join(__dirname, "../data/code.txt");
export const sleep = promisify(setTimeout);

const TIMEOUT = 100 * 1000;
const BARCODE_RESET_HOUR = 6;
const BARCODE_RESET_MINUTE = 0;

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
    this.comService = null;
    this.isInitialized = false;
    this.shiftUtility = new ShiftUtility();
    this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
    this.setupShutdownHandlers();

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
      await sleep(100);

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
        this.resetMonitor.terminate();
      }

      if (this.comService) {
        logger.info("🔌 Closing COM port...");
        await this.comService.closePort();
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
    logger.info(
      "-----------------------------------------------------------------------------------------------------------"
    );
    logger.debug(
      `Awaiting ${register}.${bit} to be ${value} (timeout: ${timeout}ms)`
    );
    logger.info(
      "-----------------------------------------------------------------------------------------------------------"
    );

    return new Promise(async (resolve) => {
      let timeoutId;
      let intervalId;
      let lastResetTime = 0;
      const RESET_COOLDOWN = 2000; // 2 second cooldown between resets

      const cleanup = () => {
        clearTimeout(timeoutId);
        clearInterval(intervalId);
      };

      timeoutId = setTimeout(() => {
        cleanup();
        logger.warn(`⏰ Timeout waiting for ${register}.${bit} to be ${value}`);
        resolve("timeout");
      }, timeout);

      const checkReset = async () => {
        try {
          const resetSignal = await readBit(1600, 0);
          const currentTime = Date.now();

          if (resetSignal && currentTime - lastResetTime > RESET_COOLDOWN) {
            lastResetTime = currentTime;
            logger.info(
              `Reset signal (1600.0) detected, with cooldown protection`
            );
            await this.resetBits();
            cleanup();
            resolve(true);
          } else if (resetSignal) {
            logger.debug(`Reset signal ignored (in cooldown period)`);
          }
        } catch (error) {
          logger.error(`Error checking reset signal: ${error}`);
        }
      };

      const checkBit = async () => {
        try {
          const bitValue = await readBit(register, bit);
          if (bitValue === value) {
            cleanup();
            logger.info(
              `Received expected signal from PLC at ${register}.${bit}`
            );
            resolve(false);
          }
        } catch (error) {
          logger.error(`Error checking bit ${register}.${bit}: ${error}`);
        }
      };

      // Check conditions every 500ms
      intervalId = setInterval(async () => {
        await checkReset();
        await checkBit();
      }, 500);

      // Initial check
      await checkReset();
      await checkBit();
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
    let isRunning = true;
    let c = 0;
    this.io = io;

    try {
      logger.section("Scanner Initialization");

      // Ensure initialization is done
      if (!this.isInitialized) {
        logger.info("🔄 Starting scanner initialization...");
        await this.initialize();
        logger.success("Scanner initialization complete");
      }

      // Store and initialize services
      this.comService = comService;
      logger.info("🔄 Setting up reset monitor...");
      this.resetMonitor = new Worker("./services/resetMonitor.js");

      this.resetMonitor.on("message", async (message) => {
        if (message === "reset") {
          logger.separator.hash();
          logger.warn("⚠️ Reset signal received - restarting cycle");
          isRunning = false;

          await this.resetBits();
          await this.clearCodeFile(CODE_FILE_PATH);
          await sleep(1000);

          this.runContinuousScan(io, comService, { partNumber });
        }
      });

      this.resetMonitor.on("error", (error) => {
        logger.error("❌ Reset monitor error:", error);
      });

      logger.info("▶️ Starting reset monitor...");
      this.resetMonitor.postMessage("start");
      logger.success("Reset monitor activated");
    } catch (error) {
      logger.separator.hash();
      logger.error("❌ Error in initialization:", error);
      throw error;
    }

    while (isRunning) {
      try {
        logger.section(`Scan Cycle ${c + 1}`);

        // Reset and initial setup
        logger.info("🔄 Resetting bits...");
        await this.resetBits();
        // await writeBit(1410, 0, 1);

        logger.info("🧹Waiting for reset or bit 1410.0 to be 0");
        if (await this.checkResetOrBit(1410, 0, 1)) {
          logger.warn("⚠️ Reset detected at final step, restarting cycle");
          await sleep(1000);
          continue;
        }
        // await writeBit(1410, 0, 0);

        logger.separator.arrow();
        logger.info("🚀 Starting scanner workflow");

        const scannerData = await this.fetchScannerData(comService, {
          isSecondScan: false, // First scanner
        });

        if (scannerData !== "NG") {
          logger.error("First scan data is OK, stopping machine");
          logger.info("✍️ Writing bit 1414.6 to signal OK scan");
          await writeBitsWithRest(1414, 6, 1, 200, false);
          // await this.resetBits2();
          continue;
        }

        logger.warn("⚠️ First scan data is NG, proceeding with workflow");
        logger.info("✍️ Writing bit 1414.7 to signal NG scan");
        await writeBitsWithRest(1414, 7, 1, 100, false);

        logger.separator.dot();
        logger.info("🏷️ Generating barcode data");
        const { text, serialNo } =
          await this.barcodeGenerator.generateBarcodeData({
            date: new Date(),
            mongoDbService,
            partNumber,
          });

        logger.separator.single();
        logger.info("📝 Writing OCR data to file");
        await this.writeOCRDataToFile(text);
        await this.verifyAndRetryWrite(text, 2);
        logger.success("OCR data transferred successfully");

        await sleep(2 * 1000);

        logger.info("✍️ Writing bit 1410.11 to signal file transfer");
        await writeBitsWithRest(1410, 11, 1, 100, false);

        logger.info("🔍 Checking for reset or waiting for bit 1410.2");
        if (await this.checkResetOrBit(1410, 2, 1)) {
          logger.warn(
            "⚠️ Reset detected while waiting for 1410.2, restarting cycle"
          );
          this.barcodeGenerator.decSerialNo();
          await sleep(1000);
          continue;
        }

        logger.info("🧹 Clearing buffer before second scan...");

        logger.section("Second Scan Process");
        const secondScannerData = await this.fetchScannerData(comService, {
          isSecondScan: true, // Second scanner
        });

        if (secondScannerData !== "NG") {
          logger.success("Second scan OK");
        } else {
          logger.warn("⚠️ Second scan NG");
        }

        logger.separator.dot();
        logger.info("🔍 Comparing scanner data with code");
        const isDataMatching =
          await this.compareScannerDataWithCode(secondScannerData);

        logger.info(
          `✍️ Writing bit 1414.${isDataMatching ? 3 : 4} to signal data match result`
        );
        await writeBitsWithRest(1414, isDataMatching ? 3 : 4, 1, 200, false);

        if (isDataMatching) {
          logger.success("Data matches ✅");
        } else {
          logger.warn("⚠️ Data does not match");
        }

        logger.separator.single();
        logger.info("💾 Saving data to MongoDB");
        await this.saveToMongoDB({
          io,
          serialNumber: serialNo,
          markingData: text,
          scannerData: secondScannerData,
          result: isDataMatching,
          userId: "user-id", // Replace "user-id" with actual user ID
        });
        logger.success("Data saved successfully");

        logger.info("🔍 Checking for reset or waiting for bit 1410.12");
        if (await this.checkResetOrBit(1410, 12, 1)) {
          logger.warn("⚠️ Reset detected at final step, restarting cycle");
          await sleep(1000);
          continue;
        }

        logger.info("🧹 Clearing code file before next cycle");
        await this.clearCodeFile(CODE_FILE_PATH);
        logger.success("Code file cleared successfully");

        c++;
        logger.section(`Completed Scan Cycle ${c}`);
        await sleep(3 * 1000);
      } catch (error) {
        logger.separator.hash();
        logger.error("❌ Unexpected error in scanner workflow:", error);
        logger.info("⚡ Calling handleError for unexpected error");
        await this.handleError(error);
        logger.info("⏳ Waiting 5 seconds before retrying");
        await sleep(5000);
      }
    }
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
      isSecondScan = false,
      register = isSecondScan ? 1416 : 1415,
      bit = isSecondScan ? 15 : 0,
      timeout = isSecondScan ? 100 * 1000 : 100 * 1000,
      scannerLabel = isSecondScan ? "Second" : "First",
    } = options;

    logger.section(`${scannerLabel} Scanner Data Acquisition`);

    try {
      logger.info(
        `🎯 Setting up data listener for ${scannerLabel.toLowerCase()} scan...`
      );

      const scannerData = await new Promise((resolve, reject) => {
        const dataHandler = (data) => {
          logger.success(
            `📥 Data received from ${scannerLabel.toLowerCase()} scanner: ${data}`
          );

          // Emit scanner read event to UI
          if (this.io) {
            this.io.emit("scanner_read", {
              timestamp: new Date(),
              scannerType: scannerLabel,
              data: data,
            });
          }

          clearTimeout(timeoutId);
          resolve(data);
          this.comService.off("dataGot", dataHandler);
        };

        // Set up event listener
        logger.info("👂 Adding event listener for scanner data");
        this.comService.on("dataGot", dataHandler);

        // Configure timeout
        const timeoutId = setTimeout(() => {
          logger.error(
            `⏰ Timeout waiting for ${scannerLabel.toLowerCase()} scanner data`
          );
          this.comService.off("dataGot", dataHandler);
          reject(new Error(`${scannerLabel} scanner data timeout`));
        }, timeout);

        // Trigger scanner
        logger.info(`🔄 Triggering ${scannerLabel.toLowerCase()} scanner...`);
        writeBitsWithRest(register, bit, 1, 100, false)
          .then(() =>
            logger.success(`${scannerLabel} scanner triggered successfully`)
          )
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
      return scannerData;
    } catch (error) {
      logger.separator.hash();
      logger.error(
        `❌ Error acquiring ${scannerLabel.toLowerCase()} scanner data:`,
        error
      );
      throw error;
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
}

// Export singleton instance
export const scannerController = new ScannerController();
logger.success("Scanner controller module loaded");
