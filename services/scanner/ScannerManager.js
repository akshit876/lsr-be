import { tcpClient } from "../tcp.js";
import logger from "../../logger.js";
import { PATHS } from "./constants.js";
import fs from "fs";

export class ScannerManager {
  constructor() {
    this.isScanning = false;
  }

  async handleFirstScan() {
    logger.info("Starting first scan handler");

    const scannerData = await this.fetchScannerData({ isSecondScan: false });

    if (scannerData && scannerData.trim().toUpperCase() === "NG") {
      logger.warn("⚠️ First scan data is NG, proceeding with workflow");
      return { shouldContinue: true };
    }

    if (scannerData != null) {
      logger.info(
        "First scan data is OK, stopping machine and restarting cycle"
      );
      return { shouldContinue: false, scannerData };
    }

    return { shouldContinue: false };
  }

  async handleSecondScan(barcodeData) {
    const scannerData = await this.fetchScannerData({ isSecondScan: true });

    if (scannerData.trim().toUpperCase() === "NG") {
      logger.info("🔄 Second scan resulted in NG");
      return {
        success: false,
        grading: "F",
        scannerData,
      };
    }

    const grading = scannerData.slice(-1);
    const trimmedScannerData = scannerData.slice(0, -1);

    const isDataMatching =
      await this.compareScannerDataWithCode(trimmedScannerData);
    logger.info("🔄 Data matching without grade", isDataMatching);

    return {
      success: isDataMatching,
      grading,
      scannerData,
      trimmedScannerData,
    };
  }

  async fetchScannerData({ isSecondScan }) {
    try {
      const result = await tcpClient.getDataTwiceAndConcat({
        isFirst: !isSecondScan,
        isSecond: isSecondScan,
      });

      return result.substring(0, 29);
    } catch (error) {
      logger.error("Error fetching scanner data:", error);
      throw error;
    }
  }

  async writeOCRDataToFile(ocrDataString) {
    try {
      await this.clearCodeFile();
      fs.writeFileSync(PATHS.CODE_FILE, ocrDataString, "utf8");
      logger.info("OCR data written to code.txt");
      return true;
    } catch (error) {
      logger.error(`Error writing OCR data to file: ${error.message}`);
      throw error;
    }
  }

  async clearCodeFile() {
    try {
      fs.writeFileSync(PATHS.CODE_FILE, "", "utf8");
      logger.info("Code file cleared.");
    } catch (error) {
      logger.error(`Error clearing code file: ${error.message}`);
      throw error;
    }
  }

  async compareScannerDataWithCode(scannerData) {
    try {
      const codeData = fs.readFileSync(PATHS.CODE_FILE, "utf8").trim();
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
}
