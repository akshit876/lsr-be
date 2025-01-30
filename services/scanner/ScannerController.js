import logger from "../../logger.js";
import { BitOperations } from "./BitOperations.js";
import { ScannerCleanup } from "./ScannerCleanup.js";
import ScannerState from "./ScannerState.js";
import { setupShutdownHandlers } from "./ShutdownHandler.js";
import { BarcodeHandler } from "./BarcodeHandler.js";
import { ScannerInitializer } from "./ScannerInitializer.js";
import { ResetMonitorCluster } from "./ResetMonitorCluster.js";
import { ScanCycleHandler } from "./ScanCycleHandler.js";
import { MongoDBHandler } from "./MongoDBHandler.js";

class ScannerController {
  static instance = null;

  constructor() {
    if (ScannerController.instance) {
      return ScannerController.instance;
    }

    this.state = ScannerState;
    this.barcodeHandler = new BarcodeHandler();
    this.initializer = new ScannerInitializer();
    this.scanCycleHandler = new ScanCycleHandler(this);
    this.mongoDBHandler = new MongoDBHandler();
    this.resetMonitor = new ResetMonitorCluster();

    setupShutdownHandlers(this);
    ScannerController.instance = this;
    logger.success("Scanner controller instance created");
  }

  setupInitialState(io, partNumber) {
    this.state.io = io;
    this.state.currentPartNumber = partNumber;
    this.state.setRunning(true);
    this.state.reset();
    logger.info("Scanner initial state configured");
  }

  async handleReset() {
    try {
      logger.info("🔄 Processing reset signal");
      await BitOperations.resetBits();
      this.barcodeHandler.decrementSerialNo();
      this.state.resetPending = true;

      if (this.state.io) {
        this.state.io.emit("cycle_reset", {
          timestamp: new Date(),
          cycleNumber: this.state.cycleCount + 1,
        });
      }
    } catch (error) {
      logger.error("Error handling reset:", error);
      throw error;
    }
  }

  async handleScanError(error) {
    logger.error("❌ Unexpected error in scanner workflow:", error);
    try {
      await BitOperations.resetBits();
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (secondaryError) {
      logger.error("Error during error recovery:", secondaryError);
    }
  }

  async executeScanCycle(comService, partNumber) {
    return this.scanCycleHandler.executeScanCycle(comService, partNumber);
  }

  async saveToMongoDB(data) {
    return this.mongoDBHandler.saveToMongoDB(data);
  }

  async updateResetTime(hour, minute) {
    try {
      logger.info(`Updating reset time to ${hour}:${minute}`);
      await this.barcodeHandler.setResetTime(hour, minute);
      logger.success("Reset time updated successfully");
      return { hour, minute };
    } catch (error) {
      logger.error("Error updating reset time:", error);
      throw error;
    }
  }

  async handleManualReset(resetValue) {
    try {
      logger.section("Manual Serial Number Reset");
      logger.info("🔄 Manual reset triggered");

      const result =
        await this.barcodeHandler.manualSerialNumberReset(resetValue);
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

  async cleanup(resetWorker) {
    logger.section("Scanner Cleanup");
    try {
      this.state.setRunning(false);
      this.state.resetPending = false;

      if (this.resetMonitor) {
        await this.resetMonitor.stop();
      }

      await ScannerCleanup.cleanupResources(this);
      logger.success("Scanner cleanup completed");
    } catch (error) {
      logger.error("Error during scanner cleanup:", error);
      throw error;
    }
  }

  async initialize() {
    if (this.state.isInitialized) {
      logger.warn("⚠️ Scanner controller already initialized");
      return;
    }
    await this.initializer.initialize(this);
  }

  async runContinuousScan(io, comService, { partNumber }) {
    this.setupInitialState(io, partNumber);

    try {
      // Initialize scanner and start reset monitor
      await this.initialize();
      await this.startResetMonitor();

      // Main scan cycle loop
      while (this.state.isRunning) {
        try {
          logger.section(
            `⚡ Executing Scan Cycle ${this.state.cycleCount + 1}`
          );

          if (!this.state.resetPending) {
            await this.executeScanCycle(comService, partNumber);
            this.state.incrementCycle();
          } else {
            // Reset was detected, clear flag and restart cycle
            this.state.resetPending = false;
            logger.warn(
              `🔄 Reset detected - Restarting cycle ${this.state.cycleCount + 1}`
            );
            // Optional: Add delay before restarting
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          await this.handleScanError(error);
        }
      }
    } catch (error) {
      logger.error("Fatal error in scan cycle:", error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async startResetMonitor() {
    try {
      await this.resetMonitor.start();

      this.resetMonitor.on("reset", async () => {
        logger.info("Reset signal received from monitor cluster");
        await this.handleReset();
      });

      logger.success("Reset monitor cluster initialized");
    } catch (error) {
      logger.error("Failed to start reset monitor:", error);
      throw error;
    }
  }
}

export const scannerController = new ScannerController();
