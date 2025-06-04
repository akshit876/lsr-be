import { fileURLToPath } from "url";
import path, { dirname } from "path";
import logger from "../logger.js";
import mongoDbService from "./mongoDbService.js";
import { writeBit, writeRegister } from "./modbus.js";
import ShiftUtility from "./ShiftUtility.js";
import BarcodeGenerator from "./barcodeGenrator.js";
import { promisify } from "util";
import fs from "fs";
import { Worker } from "worker_threads";
import process from "process";

const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);

const CODE_FILE_PATH = path.join(__dirname, "../data/code.txt");
const TEXT_FILE_PATH = path.join(__dirname, "../data/text.txt");
export const sleep = promisify(setTimeout);

const TIMEOUT = 100 * 1000;

class ScannerController {
  static instance = null;

  constructor() {
    logger.section("Marking Controller Initialization");

    if (ScannerController.instance) {
      logger.info("🔄 Returning existing marking controller instance");
      return ScannerController.instance;
    }

    logger.info("🎯 Creating new marking controller instance");
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
    logger.success("Marking controller instance created");
  }

  async initialize() {
    logger.section("Marking Controller Initialization");

    if (this.isInitialized) {
      logger.warn("⚠️ Marking controller already initialized");
      return;
    }

    try {
      logger.info("🚀 Starting initialization sequence");

      // Initialize MongoDB connection
      logger.info("📦 Connecting to MongoDB...");
      await mongoDbService.connect("main-data", "records");
      logger.success("MongoDB connected successfully");

      // Note: COM port initialization removed as it's not needed for marking workflow
      // We only need PLC communication via Modbus for the simplified workflow
      logger.info(
        "🔧 Skipping COM port setup - not required for marking workflow"
      );

      // Initialize barcode generator
      logger.info("🏷️ Setting up barcode generator...");
      this.shiftUtility = new ShiftUtility();
      this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
      await this.barcodeGenerator.initialize("main-data", "records");
      logger.success("Barcode generator initialized");

      this.isInitialized = true;
      logger.success("Marking controller initialization complete");
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

      const { readRegister } = await import("./modbus.js");
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

  async initializeScannerAndMonitor(io, comService) {
    if (!this.isInitialized) {
      logger.info("🔄 Starting system initialization...");
      await this.initialize();
    }

    // Debug logging - simplified since we don't need COM service for scanning anymore
    logger.info("🔍 System state:");
    logger.info(`   - isInitialized: ${this.isInitialized}`);
    logger.info(
      `   - MongoDB connected: ${mongoDbService.isConnected || "unknown"}`
    );

    // Note: COM service is no longer required for the simplified marking workflow
    // We only need PLC communication via Modbus
    if (comService) {
      logger.info(
        "🔗 COM service provided but not required for marking workflow"
      );
    }

    this.setupResetMonitor();
    logger.info("✅ System ready for marking workflow");
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
      await sleep(3 * 1000);
      return true;
    } catch (error) {
      logger.error("❌ Error in final checks:", error);
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
        logger.info(
          `🔄 Continuing to wait for PLC bit ${register}.${bit} = ${value}...`
        );
      } catch (error) {
        logger.error(`Error in bit check: ${error.message}`);
        await sleep(1000);
      }
    }
  }

  async singleCheckAttempt(register, bit, value, timeout) {
    const { readBit } = await import("./modbus.js");

    return new Promise((resolve) => {
      let timeoutId = null;

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

  async saveToMongoDB({
    io,
    serialNumber,
    markingData,
    scannerData,
    grading,
    result,
    isUpdate = false,
  }) {
    const { format } = await import("date-fns");
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
        logger.info(
          `🔄 Attempting to update record for SerialNumber: ${serialNumber}, Model: ${modelNumber}`
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
        } else {
          logger.warn(`🔍 Trying to insert as new record instead`);
          await mongoDbService.insertRecord(data, "main-data", "records");
        }
      } else {
        logger.info(
          `📝 Inserting new record for SerialNumber: ${serialNumber}, Model: ${modelNumber}`
        );
        await mongoDbService.insertRecord(data, "main-data", "records");
        logger.info(
          `✅ Data saved to MongoDB with CurrentId: ${currentId}, Model: ${modelNumber}`
        );
      }

      if (io) {
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

  async runContinuousScan(io = null, comService, { partNumber }) {
    this.io = io;
    this.currentPartNumber = partNumber;
    this.isRunning = true;
    logger.info(
      `🔄 Starting continuous marking workflow (current cycle count: ${this.cycleCount})`
    );

    try {
      await this.initializeScannerAndMonitor(io, comService);

      while (this.isRunning) {
        try {
          await sleep(1200);

          logger.separator.hash();
          logger.warn(`⚡ Marking Cycle ${this.cycleCount + 1}`);
          logger.separator.hash();

          const resetMonitoring = this.startResetMonitoring();

          await Promise.race([
            this.executeScanCycle(comService, partNumber),
            resetMonitoring,
          ]);

          this.cleanupResetListeners();
        } catch (error) {
          if (error.message === "RESET_DETECTED") {
            logger.warn("⚠️ Reset detected, restarting cycle");
            continue;
          } else if (error.message === "RESTART_CYCLE") {
            logger.info("🔄 Restarting cycle");
            continue;
          }
          await this.handleScanError(error);
        }
      }
    } catch (error) {
      logger.error("❌ Fatal error in continuous marking workflow:", error);
      throw error;
    } finally {
      this.cleanupResetListeners();
    }
  }

  async executeScanCycle(comService, partNumber) {
    // Step 1: Wait for start signal (1410.0)
    logger.info("Waiting for start signal (1410.0)...");
    const resetResult = await this.checkResetOrBit(1410, 0, 1);
    if (resetResult === true) {
      logger.info("Reset detected, restarting cycle");
      return;
    }

    // Step 2: Generate and Write Barcode (no scanning, just file generation)
    logger.info("🏷️ Starting file generation and transfer process...");
    const barcodeData = await this.generateAndWriteBarcode(partNumber);
    if (!barcodeData) {
      logger.error("❌ Failed to generate barcode data, ending cycle");
      return;
    }

    // Step 3: Signal File Transfer to PLC
    logger.info("✍️ Writing bit 1414.15(F) to signal file transfer to PLC");
    await writeBit(1414, 15, 1);
    logger.success("📡 File transfer signal sent to PLC");

    // Step 4: Wait for Marking Completion Signal from PLC
    logger.info(
      "⏳ Waiting for marking completion signal from PLC (1410.3)..."
    );
    const markingResult = await this.checkResetOrBit(1410, 3, 1);
    if (markingResult === true) {
      logger.warn(
        "⚠️ Reset detected while waiting for marking completion, restarting cycle"
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

    logger.success("✅ Marking completion signal received from PLC");

    // Step 5: Update MongoDB with marking completion
    logger.info("💾 Updating MongoDB with marking completion...");
    await this.saveToMongoDB({
      io: this.io,
      serialNumber: barcodeData.serialNo,
      markingData: barcodeData.text,
      scannerData: "N/A",
      result: "OK",
      grading: "N/A",
      isUpdate: true,
    });

    // Step 6: Final Checks and Cycle Completion
    logger.info("🔍 Performing final checks and cycle completion...");
    const finalChecksResult = await this.performFinalChecks();

    if (finalChecksResult) {
      this.cycleCount++;
      logger.section(`✅ Completed Simple Cycle ${this.cycleCount}`);
      logger.info(`🎯 Cycle count incremented to: ${this.cycleCount}`);

      if (this.io) {
        logger.info("📡 Broadcasting cycle completion to UI...");
        await mongoDbService.broadcastDataToAllClients(
          this.io,
          "main-data",
          "records"
        );

        this.io.emit("scan-cycle-completed", {
          cycleNumber: this.cycleCount,
          timestamp: new Date().toISOString(),
          success: true,
          result: "OK",
          type: "marking-only",
        });
      }

      logger.info("📡 Sending cycle complete OK signal to PLC (1414.3)");
      await writeBit(1414, 3, 1);

      logger.info(
        "⏸️ Cycle completed - waiting 2 seconds before next cycle..."
      );
      await sleep(2000);
    } else {
      logger.warn(
        `❌ Cycle completion failed - final checks returned: ${finalChecksResult}`
      );
      logger.warn(`   - Current cycle count remains: ${this.cycleCount}`);

      if (this.io) {
        logger.info("📡 Broadcasting failed cycle data to UI...");
        await mongoDbService.broadcastDataToAllClients(
          this.io,
          "main-data",
          "records"
        );

        this.io.emit("scan-cycle-completed", {
          cycleNumber: this.cycleCount,
          timestamp: new Date().toISOString(),
          success: false,
          result: "NG",
          error: "Final checks failed",
          type: "marking-only",
        });
      }

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
}

// Export singleton instance
export const scannerController = new ScannerController();
logger.success("Marking controller module loaded");
