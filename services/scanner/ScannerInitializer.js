import logger from "../../logger.js";
import mongoDbService from "../mongoDbService.js";
import { tcpClient } from "../tcp.js";

export class ScannerInitializer {
  async initialize(scanner) {
    logger.section("Scanner Controller Initialization");

    try {
      logger.info("🚀 Starting initialization sequence");

      await this.initializeMongoDB();
      await this.initializeBarcodeHandler(scanner);
      await this.initializeTcpConnection();

      scanner.state.isInitialized = true;
      logger.success("Scanner controller initialization complete");
    } catch (error) {
      logger.error("❌ Error during initialization:", error);
      scanner.state.isInitialized = false;

      if (error.message.includes("MongoDB")) {
        logger.info("⏳ Waiting 5 seconds before retrying MongoDB connection");
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return this.initialize(scanner);
      }

      throw error;
    }
  }

  async initializeMongoDB() {
    logger.info("📦 Connecting to MongoDB...");
    await mongoDbService.connect("main-data", "records");
    logger.success("MongoDB connected successfully");
  }

  async initializeBarcodeHandler(scanner) {
    logger.info("🏷️ Setting up barcode generator...");
    await scanner.barcodeHandler.initialize();
    logger.success("Barcode generator initialized");
  }

  async initializeTcpConnection() {
    const TCP_CONFIG = {
      PORT: 5024,
      HOST: "192.168.3.147",
    };

    await tcpClient.connect({ port: TCP_CONFIG.PORT, host: TCP_CONFIG.HOST });
    logger.success("TCP Scanner client connected");
  }
}
