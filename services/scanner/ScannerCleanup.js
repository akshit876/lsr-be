import logger from "../../logger.js";
import mongoDbService from "../mongoDbService.js";
import { BitOperations } from "./BitOperations.js";

export class ScannerCleanup {
  static async cleanupResources(scanner) {
    logger.section("Cleanup Process");
    try {
      await this.cleanupMonitor(scanner);
      await this.cleanupConnections(scanner);
      await this.resetBits();
      logger.success("Cleanup completed successfully");
    } catch (error) {
      logger.error("❌ Error during cleanup:", error);
      throw error;
    }
  }

  static async cleanupMonitor(scanner) {
    if (scanner.resetMonitor) {
      logger.info("🔄 Terminating reset monitor...");
      scanner.cleanupResetListeners();
      await scanner.resetMonitor.terminate();
      scanner.resetMonitor = null;
    }
  }

  static async cleanupConnections(scanner) {
    if (scanner.comService) {
      logger.info("🔌 Closing COM port...");
      await scanner.comService.closePort();
    }
    logger.info("📦 Disconnecting from MongoDB...");
    await mongoDbService.disconnect();
  }

  static async resetBits() {
    logger.info("🔄 Performing final bit reset...");
    await BitOperations.resetBits();
  }
}
