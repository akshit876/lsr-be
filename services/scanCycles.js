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
// TcpScannerService import removed - printing only mode

const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);

const CODE_FILE_PATH = path.join(__dirname, "../data/code.txt");
const TEXT_FILE_PATH = path.join(__dirname, "../data/text.txt");
export const sleep = promisify(setTimeout);

const TIMEOUT = 100 * 1000;

// TCP Scanner configuration removed - printing only mode

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

      // Scanner initialization removed - printing only mode

      // Initialize barcode generator
      logger.info("🏷️ Setting up barcode generator...");
      // Initialize shift utility first
      await this.shiftUtility.initialize();
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

      // Scanner cleanup removed - printing only mode

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
      const safetyCheckInterval = setInterval(async () => {
        try {
          // Read safety bits from register 1490
          const [partPresent, emergencyStop, safetySensor] = await Promise.all([
            readBit(1490, 0), // Part not present. 1490.0
            readBit(1490, 1), // Emergency stop. 1490.1
            readBit(1490, 2), // Safety sensor. 1490.2
          ]);

          // Check safety conditions
          if (partPresent) {
            cleanup();
            logger.error("🚨 SAFETY VIOLATION: Part not present (1490.0 = 0)");

            // Emit safety violation event to UI immediately
            if (this.io) {
              this.io.emit("safety_violation", {
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
            if (this.io) {
              this.io.emit("safety_violation", {
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
            if (this.io) {
              this.io.emit("safety_violation", {
                timestamp: new Date().toISOString(),
                violation: "Safety sensor not engaged",
                cycleNumber: this.cycleCount,
              });
            }

            resolve("safety_violation");
            return;
          }
        } catch (error) {
          logger.error(
            `Error checking safety conditions and alarms: ${error.message}`
          );
        }
      }, 500);

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

  // compareScannerDataWithCode method removed - printing only mode

  // Helper method to trigger UI refresh
  triggerUIRefresh(io, eventType = "data_updated", additionalData = {}) {
    if (io) {
      const baseEvent = {
        timestamp: new Date().toISOString(),
        cycleNumber: this.cycleCount,
        ...additionalData,
      };

      // Emit the specific event
      io.emit(eventType, baseEvent);

      // Always trigger data refresh
      io.emit("request-data-refresh");

      logger.info(`📡 UI refresh triggered for event: ${eventType}`);
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

      // Trigger UI refresh using helper method
      this.triggerUIRefresh(io, "data_updated", {
        message: "Data saved to MongoDB",
        serialNumber,
        result,
      });
    } catch (error) {
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

  async runContinuousScan(io = null, _tcpScannerService, { partNumber }) {
    this.io = io;
    this.currentPartNumber = partNumber;
    this.isRunning = true;
    logger.info(
      `🔄 Starting continuous print cycles (current cycle count: ${this.cycleCount})`
    );

    try {
      await this.initializeScannerAndMonitor();

      while (this.isRunning) {
        try {
          await sleep(1200);

          // Clear separator and print cycle count
          logger.separator.hash();
          logger.warn(`⚡ Print Cycle ${this.cycleCount + 1}`);
          logger.separator.hash();

          // Create new reset monitoring for each cycle
          const resetMonitoring = this.startResetMonitoring();

          await Promise.race([
            this.executeScanCycle(null, partNumber),
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
      logger.error("❌ Fatal error in continuous print cycles:", error);
      throw error;
    } finally {
      this.cleanupResetListeners();
    }
  }

  // New method to encapsulate the main printing cycle logic (no scanners)
  async executeScanCycle(_tcpScannerService, partNumber) {
    // First check for 1410.0 (start signal)
    logger.info("Waiting for start signal (1410.0)...");
    const resetResult = await this.checkResetOrBit(1410, 0, 1);
    if (resetResult === true) {
      logger.info("Reset detected, restarting cycle");
      return;
    }

    // Step 1: Generate and Write Barcode (printing only mode)
    const barcodeData = await this.generateAndWriteBarcode(partNumber);
    if (!barcodeData) {
      // Marking failed - send NG signal to PLC
      logger.warn("❌ Marking failed - sending NG signal to PLC");
      logger.info(
        "✍️ Writing bit 1414.4 to signal NG verification (marking failed)"
      );
      await writeBit(1414, 4, 1);
      return;
    }

    // Step 2: Signal Transfer and Wait
    logger.info("✍️ Writing bit 1414.15(F) to signal file transfer");
    await writeBit(1414, 15, 1);

    logger.info("🔍 Checking for reset or waiting for bit 1410.3");
    if (await this.checkResetOrBit(1410, 3, 1)) {
      logger.warn(
        "⚠️ Reset detected while waiting for 1410.3, restarting cycle"
      );
      await sleep(1000);
      // Send NG signal to PLC for reset during transfer
      logger.info(
        "✍️ Writing bit 1414.4 to signal NG verification (reset during transfer)"
      );
      await writeBit(1414, 4, 1);
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

    // Step 3: Send OK result to PLC after marking completes (simulate verification scan)
    logger.info(
      "✍️ Writing bit 1414.3 to signal OK verification (marking completed)"
    );
    await writeBit(1414, 3, 1);

    // Step 3.5: Save successful marking data to MongoDB
    logger.info("💾 Saving successful marking data to MongoDB...");
    await this.saveToMongoDB({
      io: this.io,
      serialNumber: barcodeData.serialNo,
      markingData: barcodeData.text,
      scannerData: "N/A", // No scanner in printing-only mode
      result: "OK", // Marking was successful
      grading: "N/A", // No grading in printing-only mode
      isUpdate: true, // Update the initial record with final result
    });
    logger.info("✅ MongoDB save completed for successful marking");

    // Step 4: Final Checks and Cleanup
    logger.info("🔍 Starting final checks and cycle completion...");
    const finalChecksResult = await this.performFinalChecks();
    logger.info(`📋 Final checks result: ${finalChecksResult}`);

    if (finalChecksResult) {
      this.cycleCount++;
      logger.section(`✅ Completed Print Cycle ${this.cycleCount}`);
      logger.info(`🎯 Cycle count incremented to: ${this.cycleCount}`);

      // Trigger UI refresh on successful cycle completion
      if (this.io) {
        logger.info("📡 Broadcasting cycle completion to UI...");

        // Emit cycle completion events
        this.io.emit("cycle_completed", {
          timestamp: new Date().toISOString(),
          cycleNumber: this.cycleCount,
          success: true,
        });

        this.io.emit("scan-cycle-completed", {
          cycleNumber: this.cycleCount,
          timestamp: new Date().toISOString(),
          success: true,
          result: "OK", // Always OK since no verification needed
        });

        // Trigger data refresh for all connected clients
        this.io.emit("request-data-refresh");
      }

      // Add 2-second delay after cycle completion
      logger.info(
        "⏸️ Cycle completed - waiting 2 seconds before next cycle..."
      );
      await sleep(2000);
    } else {
      logger.warn(`❌ Cycle completion failed:`);
      logger.warn(`   - Final checks: ${finalChecksResult}`);
      logger.warn(`   - Current cycle count remains: ${this.cycleCount}`);

      // Send NG signal to PLC for failed final checks
      logger.info(
        "✍️ Writing bit 1414.4 to signal NG verification (final checks failed)"
      );
      await writeBit(1414, 4, 1);

      // Trigger UI refresh even for failed cycles
      if (this.io) {
        logger.info("📡 Broadcasting failed cycle data to UI...");
        this.io.emit("cycle_failed", {
          timestamp: new Date().toISOString(),
          cycleNumber: this.cycleCount,
          success: false,
        });

        // Emit failed cycle event
        this.io.emit("scan-cycle-completed", {
          cycleNumber: this.cycleCount,
          timestamp: new Date().toISOString(),
          success: false,
          result: "NG",
          error: "Cycle completion failed",
        });

        // Trigger data refresh for all connected clients
        this.io.emit("request-data-refresh");
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

  // fetchScannerData method removed - printing only mode

  // Helper methods for scan configuration removed - printing only mode

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

      // Generate text file with the specified format: 1=julian date, 2=year code, 3=company code, 4=DMCcode
      const textFileContent = this.generateTextFileContent();

      await Promise.all([
        this.writeToFile(CODE_FILE_PATH, barcodeText, "Barcode text"),
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

        // Also trigger data refresh
        this.io.emit("request-data-refresh");
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

  // Generate text file content with the specified format
  generateTextFileContent() {
    const now = new Date();

    // 1 = Julian date (day of year)
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const julianDate = Math.floor(diff / oneDay);

    // 2 = Single digit year code (last digit of year)
    const yearCode = now.getFullYear() % 10;

    // 3 = Company code (fixed as 'R')
    const companyCode = "R";

    // 4 = DMC code (you can customize this)
    const dmcCode = "DMC001";

    // Format: 1234 as ordering (not key-value pairs)
    const content = `${julianDate}${yearCode}${companyCode}${dmcCode}`;

    return content;
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

  // handleFirstScan method removed - printing only mode

  async initializeScannerAndMonitor() {
    if (!this.isInitialized) {
      logger.info("🔄 Starting initialization...");
      await this.initialize();
    }

    // Scanner initialization removed - printing only mode
    logger.info("🖨️ Running in printing-only mode (no scanners)");

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
    logger.error("❌ Unexpected error in print workflow:", error);
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

  // handleVerificationScan method removed - printing only mode

  // testComPortCommunication method removed - printing only mode

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
