import logger from "../../logger.js";
import { ScannerState } from "./ScannerState.js";
import { PLCManager } from "./PLCManager.js";
import { ScannerManager } from "./ScannerManager.js";
import { FileManager } from "./FileManager.js";
import { DatabaseManager } from "./DatabaseManager.js";
import { BarcodeManager } from "./BarcodeManager.js";
import { ResetManager } from "./ResetManager.js";
import { REGISTERS, TIMEOUTS } from "./constants.js";

class ScannerController {
  static instance = null;

  constructor() {
    if (ScannerController.instance) {
      return ScannerController.instance;
    }

    this.state = new ScannerState();
    this.fileManager = new FileManager();
    this.plcManager = new PLCManager();
    this.scannerManager = new ScannerManager();
    this.dbManager = new DatabaseManager();
    this.barcodeManager = new BarcodeManager(this.fileManager);
    this.resetManager = new ResetManager(this.plcManager, this.scannerManager, this.state);

    this.setupShutdownHandlers();
    ScannerController.instance = this;
  }

  async initialize() {
    if (this.state.isInitialized) {
      return;
    }

    try {
      await Promise.all([
        this.dbManager.initialize(),
        this.barcodeManager.initialize(),
        this.plcManager.initialize(),
      ]);

      this.state.isInitialized = true;
      logger.success("Scanner controller initialization complete");
    } catch (error) {
      logger.error("Initialization failed:", error);
      throw error;
    }
  }

  async runContinuousScan(io = null, comService, { partNumber }) {
    this.state.setupScanState(io, comService, partNumber);

    try {
      await this.initialize();

      while (this.state.isRunning) {
        try {
          await this.executeSingleScanCycle();
          await this.resetManager.monitorResetSignal();
        } catch (error) {
          if (error.message === "RESET_DETECTED") {
            continue;
          }
          await this.handleScanCycleError(error);
        }
      }
    } catch (error) {
      await this.handleFatalError(error);
    }
  }

  async executeSingleScanCycle() {
    await this.waitForStartSignal();

    // Handle first scan
    const firstScanResult = await this.scannerManager.handleFirstScan();
    if (!firstScanResult.shouldContinue) {
      return;
    }

    // Generate and write barcode
    const barcodeData = await this.barcodeManager.generateAndWrite(this.state.currentPartNumber);
    if (!barcodeData) {
      return;
    }

    // Signal file transfer
    await this.plcManager.signalFileTransfer();

    // Handle second scan
    const secondScanResult = await this.scannerManager.handleSecondScan(barcodeData);
    
    // Process scan results
    await this.processScanResults(secondScanResult);
  }

  async waitForStartSignal() {
    while (this.state.isRunning) {
      const startBit = await this.plcManager.readBit(
        REGISTERS.START_SIGNAL.register,
        REGISTERS.START_SIGNAL.bit
      );

      if (startBit) {
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async processScanResults(scanResult) {
    const dayId = await this.state.getCurrentDayId();

    await this.dbManager.saveRecord({
      partNumber: this.state.currentPartNumber,
      scannerData: scanResult.scannerData,
      grading: scanResult.grading,
      cycleCount: this.state.cycleCount,
      dayId,
      success: scanResult.success,
    });

    this.state.emitSocketEvent("scanner_read", {
      scannerType: "Second Scan",
      data: scanResult.scannerData,
    });

    if (scanResult.success) {
      this.barcodeManager.incrementSerialNo();
      this.state.incrementCycleCount();
    }
  }

  async handleScanCycleError(error) {
    logger.error("Scan cycle error:", error);
    this.state.emitSocketEvent("error", { message: error.message });
    await new Promise(resolve => setTimeout(resolve, TIMEOUTS.RETRY_DELAY));
  }

  async handleFatalError(error) {
    logger.error("Fatal error in scan cycle:", error);
    this.state.emitSocketEvent("fatal_error", { message: error.message });
    this.state.isRunning = false;
  }

  setupShutdownHandlers() {
    process.on("SIGTERM", this.handleShutdown.bind(this));
    process.on("SIGINT", this.handleShutdown.bind(this));
  }

  async handleShutdown() {
    logger.info("Shutting down scanner controller...");
    this.state.isRunning = false;
    await this.dbManager.close();
    process.exit(0);
  }
}

// Export singleton instance
export const scannerController = new ScannerController(); 