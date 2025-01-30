import logger from "../../logger.js";
import { ScannerOperations } from "./ScannerOperations.js";
import { BitOperations } from "./BitOperations.js";
import { sleep } from "../utils.js";
import { writeBit } from "../modbus.js";

export class ScanCycleHandler {
  constructor(scanner) {
    this.scanner = scanner;
  }

  async executeScanCycle(comService, partNumber) {
    logger.section(`Scan Cycle ${this.scanner.state.cycleCount + 1}`);

    try {
      // First scan handling
      const firstScanResult = await this.handleFirstScan();
      if (!firstScanResult.shouldContinue) {
        return;
      }

      // Generate and write barcode
      const barcodeData =
        await this.scanner.barcodeHandler.generateAndWriteBarcode(
          partNumber,
          this.scanner.state.io
        );
      if (!barcodeData) {
        throw new Error("Failed to generate or write barcode");
      }

      // Signal file transfer
      await this.signalFileTransfer();

      // Second scan handling
      await this.handleSecondScan(barcodeData);

      // Perform final checks
      await this.performFinalChecks();
    } catch (error) {
      if (error.message === "RESTART_CYCLE") {
        logger.warn("🔄 Restarting cycle due to specific condition");
        return;
      }
      throw error;
    }
  }

  async handleFirstScan() {
    logger.info("Starting first scan handler");

    const scannerData = await ScannerOperations.fetchScannerData({
      isSecondScan: false,
    });

    if (await ScannerOperations.checkReset()) {
      logger.warn("⚠️ Reset detected during first scan, restarting cycle");
      return { shouldContinue: false };
    }

    if (scannerData?.trim().toUpperCase() === "NG") {
      logger.warn("⚠️ First scan data is NG, proceeding with workflow");
      await writeBit(1414, 14, 1);
      return { shouldContinue: true };
    }

    if (scannerData !== null) {
      logger.info(
        "First scan data is OK, stopping machine and restarting cycle"
      );
      if (this.scanner.state.io) {
        this.scanner.state.io.emit("first_scan_ok", {
          timestamp: new Date(),
          scannerData: scannerData,
          message: "First scan detected OK part, cycle restarting",
        });
      }
      await writeBit(1414, 13, 1);
      throw new Error("RESTART_CYCLE");
    }

    return { shouldContinue: false };
  }

  async signalFileTransfer() {
    try {
      logger.info("🔄 Signaling file transfer...");
      await writeBit(1414, 2, 1);
      await sleep(200);
      await writeBit(1414, 2, 0);
      logger.success("File transfer signal sent");
    } catch (error) {
      logger.error("❌ Error signaling file transfer:", error);
      throw error;
    }
  }

  async handleSecondScan(barcodeData) {
    const secondScannerData = await ScannerOperations.fetchScannerData({
      isSecondScan: true,
    });

    if (secondScannerData.trim().toUpperCase() === "NG") {
      await this.handleNGResult(secondScannerData, barcodeData);
      return { success: false };
    }

    await this.handleScanResult(secondScannerData, barcodeData);
  }

  async handleNGResult(scannerData, barcodeData) {
    const grading = "F";
    logger.info("🔄 Second scan resulted in NG");
    await writeBit(1417, 1, 1);

    await this.scanner.saveToMongoDB({
      io: this.scanner.state.io,
      serialNumber: barcodeData.serialNo,
      markingData: barcodeData.text,
      scannerData,
      result: false,
      grading,
      isUpdate: true,
    });
  }

  async handleScanResult(scannerData, barcodeData) {
    const grading = scannerData.slice(-1);
    const trimmedScannerData = scannerData.slice(0, -1);

    const isDataMatching = await this.compareData(
      trimmedScannerData,
      barcodeData.text
    );
    const isGradingAcceptable = await this.checkGrading(scannerData);

    await writeBit(1417, isDataMatching && isGradingAcceptable ? 0 : 1, 1);

    await this.scanner.saveToMongoDB({
      io: this.scanner.state.io,
      serialNumber: barcodeData.serialNo,
      markingData: barcodeData.text,
      scannerData,
      result: isDataMatching && isGradingAcceptable,
      grading,
      isUpdate: true,
    });

    return { success: isDataMatching && isGradingAcceptable };
  }

  async compareData(scannerData, originalData) {
    logger.info("🔄 Comparing scanner data with original data");
    const isMatching = scannerData === originalData;
    logger.info(`Data matching result: ${isMatching}`);
    return isMatching;
  }

  async checkGrading(scannerData) {
    const grade = scannerData.slice(-1).toUpperCase();
    const acceptableGrades = ["A", "B", "C", "D"];
    const isAcceptable = acceptableGrades.includes(grade);
    logger.info(`Grade ${grade} acceptance: ${isAcceptable}`);
    return isAcceptable;
  }

  async performFinalChecks() {
    try {
      logger.info("🔍 Performing final checks...");
      await sleep(3000);
      return true;
    } catch (error) {
      logger.error("❌ Error in final checks:", error);
      throw error;
    }
  }
}
