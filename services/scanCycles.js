import { fileURLToPath } from "url";
import path, { dirname } from "path";
import logger from "../logger.js";
import mongoDbService from "./mongoDbService.js";
import {
  readBit,
  readRegister,
  writeBitsWithRest,
  writeRegister,
} from "./modbus.js";
import ShiftUtility from "./ShiftUtility.js";
import BarcodeGenerator from "./barcodeGenrator.js";
import { promisify } from "util";
import fs from "fs";
import { format } from "date-fns";
import { Worker } from "worker_threads";
import process from "process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CODE_FILE_PATH = path.join(__dirname, "../data/code.txt");
const TEXT_FILE_PATH = path.join(__dirname, "../data/text.txt");
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

      // Initialize barcode generator
      logger.info("🏷️ Setting up barcode generator...");
      this.shiftUtility = new ShiftUtility();
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

  async checkResetOrBit(register, bit, value) {
    logger.info(
      "-----------------------------------------------------------------------------------------------------------"
    );
    logger.debug(`awaiting ${register} , bit ${bit}`);
    logger.info(
      "-----------------------------------------------------------------------------------------------------------"
    );

    return new Promise((resolve) => {
      // eslint-disable-next-line prefer-const
      let timeoutId;
      // eslint-disable-next-line prefer-const
      let intervalId;

      const cleanup = () => {
        clearTimeout(timeoutId);
        clearInterval(intervalId);
      };

      const checkReset = async () => {
        try {
          const resetSignal = await readBit(1600, 0);
          if (resetSignal) {
            cleanup();
            logger.info(`Reset detected while waiting for ${register}.${bit}.`);
            await this.resetBits();
            resolve(true);
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
            logger.info(`Received signal from PLC at ${register}.${bit}`);
            resolve(false);
          }
        } catch (error) {
          logger.error(`Error reading bit ${register}.${bit}: ${error}`);
        }
      };

      timeoutId = setTimeout(() => {
        cleanup();
        logger.warn(
          `Timeout waiting for ${register}.${bit} to become ${value}`
        );
        resolve(true);
      }, TIMEOUT);

      intervalId = setInterval(async () => {
        await checkReset();
        await checkBit();
      }, 100);

      // Initial checks
      const performInitialChecks = async () => {
        await checkReset();
        await checkBit();
      };

      performInitialChecks();
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
      const userDetails = await mongoDbService.getUserDetails();
      const currentId = await this.getCurrentDayId();

      const data = {
        Timestamp: new Date(timestamp),
        SerialNumber: serialNumber,
        MarkingData: markingData,
        ScannerData: scannerData,
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
        // Find and update the most recent record for this serial number
        await mongoDbService.updateLastRecord(
          { SerialNumber: serialNumber },
          { $set: data },
          "main-data",
          "records"
        );
        logger.info(`Updated MongoDB record for SerialNumber: ${serialNumber}`);
      } else {
        // Insert new record
        await mongoDbService.insertRecord(data, "main-data", "records");
        logger.info(`Data saved to MongoDB with CurrentId: ${currentId}`);
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
    let isRunning = true;
    let c = 0;

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
          continue;
        }
        // await writeBit(1410, 0, 0);

        logger.separator.arrow();
        logger.info("🚀 Starting scanner workflow");

        // First scan to check if part is already marked
        const firstScanResult = await this.handleFirstScan(comService);
        if (!firstScanResult.shouldContinue) {
          logger.info("Cycle stopped after first scan");
          continue;
        }

        logger.warn("⚠️ First scan data is NG, proceeding with workflow");
        logger.info("✍️ Writing bit 1414.7 to signal NG scan");
        await writeBitsWithRest(1414, 7, 1, 100, false);

        logger.separator.dot();
        logger.info("🏷️ Generating barcode data");
        const barcodeData = await this.generateAndWriteBarcode(partNumber);
        if (!barcodeData) {
          logger.error("Failed to generate barcode data");
          continue;
        }

        logger.separator.single();
        logger.success("Barcode data generated and written successfully");

        await sleep(2 * 1000);

        logger.info("✍️ Writing bit 1410.11 to signal file transfer");
        await writeBitsWithRest(1410, 11, 1, 100, false);

        logger.info("🔍 Checking for reset or waiting for bit 1410.2");
        if (await this.checkResetOrBit(1410, 2, 1)) {
          logger.warn(
            "⚠️ Reset detected while waiting for 1410.2, restarting cycle"
          );
          // Save error state to MongoDB before restarting
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
          this.barcodeGenerator.decSerialNo();
          continue;
        }

        logger.info("🧹 Clearing buffer before second scan...");

        logger.section("Second Scan Process");
        const secondScannerData = await this.fetchScannerData(comService, {
          isSecondScan: true, // Second scanner for verification
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
          serialNumber: barcodeData.serialNo,
          markingData: barcodeData.text,
          scannerData: secondScannerData,
          grading: "N/A",
          result: isDataMatching,
          isUpdate: false,
        });
        logger.success("Data saved successfully");

        logger.info("🔍 Checking for reset or waiting for bit 1410.12");
        if (await this.checkResetOrBit(1410, 12, 1)) {
          logger.warn("⚠️ Reset detected at final step, restarting cycle");
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
      // TEMPORARY: Return hardcoded "NG" for testing
      // logger.warn(`⚠️ Using hardcoded "NG" value for ${scannerLabel.toLowerCase()} scanner (testing mode)`);
      // return 'NG';

      //  PRODUCTION CODE (Currently Disabled)
      logger.info(
        `🎯 Setting up data listener for ${scannerLabel.toLowerCase()} scan...`
      );

      const scannerData = await new Promise((resolve, reject) => {
        const dataHandler = (data) => {
          logger.success(
            `📥 Data received from ${scannerLabel.toLowerCase()} scanner: ${data}`
          );
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

  async generateAndWriteBarcode(partNumber) {
    // Check for reset signal before generating barcode
    if (await this.checkReset()) {
      logger.warn(
        "⚠️ Reset detected during barcode generation, restarting cycle"
      );
      // Save error state to MongoDB
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
      // Generate barcode data
      const barcodeData = await this.barcodeGenerator.generateBarcodeData({
        mongoDbService,
        partNumber,
      });

      // Write both files using the reusable function
      await Promise.all([
        this.writeToFile(CODE_FILE_PATH, barcodeData.text, "Barcode data"),
        this.writeToFile(TEXT_FILE_PATH, barcodeData.text, "Barcode text"),
      ]);

      // Emit marking data to UI
      if (this.io) {
        this.io.emit("marking_data", {
          timestamp: new Date(),
          data: barcodeData.text,
        });
      }

      const isVerified = await this.verifyAndRetryWrite(barcodeData.text, 2);

      // Add MongoDB write after file verification
      if (isVerified) {
        await this.saveToMongoDB({
          io: this.io,
          serialNumber: barcodeData.serialNo,
          markingData: barcodeData.text,
          scannerData: "N/A", // No scanner data at this point
          result: "N/A", // File write was successful
          grading: "N/A", // No grading at this point
          isUpdate: false,
        });
      }

      return isVerified ? barcodeData : null;
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
    resetTime.setHours(6, 0, 0, 0);

    // If current time is before 6 AM, set reset time to previous day
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
      isSecondScan: false, // First scanner
    });

    // Check for reset signal before proceeding
    if (await this.checkReset()) {
      logger.warn("⚠️ Reset detected during first scan, restarting cycle");
      return { shouldContinue: false };
    }

    // If scannerData is "NG", proceed with workflow
    if (scannerData && scannerData.trim().toUpperCase() === "NG") {
      logger.warn("⚠️ First scan data is NG, proceeding with workflow");
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
      await writeBitsWithRest(1414, 6, 1, 200, false);
    }

    return { shouldContinue: false };
  }
}

// Export singleton instance
export const scannerController = new ScannerController();
logger.success("Scanner controller module loaded");
