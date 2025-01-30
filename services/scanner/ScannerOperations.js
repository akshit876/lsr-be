import logger from "../../logger.js";
import { readBit, writeBit } from "../modbus.js";
import { tcpClient } from "../tcp.js";

export class ScannerOperations {
  static async fetchScannerData(options = {}) {
    const {
      isSecondScan = false,
      register = isSecondScan ? 1416 : 1415,
      bit = isSecondScan ? 15 : 0,
      scannerLabel = isSecondScan ? "Second" : "First",
    } = options;

    logger.section(`${scannerLabel} Scanner Data Acquisition`);

    try {
      logger.info(
        `🎯 Setting up data listener for ${scannerLabel.toLowerCase()} scan...`
      );
      await writeBit(register, bit, 1);

      const result = await tcpClient.getDataTwiceAndConcat({
        isFirst: !isSecondScan,
        isSecond: isSecondScan,
      });

      const processedResult =
        result?.trim().toUpperCase() === "NG" ? result : result?.slice(0, 29);
      return processedResult;
    } catch (error) {
      logger.error(
        `❌ Error acquiring ${scannerLabel.toLowerCase()} scanner data:`,
        error
      );
      throw error;
    }
  }

  static async checkReset() {
    try {
      const resetSignal = await readBit(1600, 0);
      return resetSignal;
    } catch (error) {
      logger.error("Error checking reset signal:", error);
      throw error;
    }
  }
}
