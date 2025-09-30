import TcpScannerService from "./services/TcpScannerService.js";
import logger from "./logger.js";
import { MAIN_SCANNER_CONFIG } from "./config/network.js";

async function testTcpScanner() {
  logger.info("🧪 Starting TCP Scanner Service Test");

  const tcpScannerService = new TcpScannerService(MAIN_SCANNER_CONFIG);

  try {
    logger.info("🔌 Testing TCP scanner connection...");

    // Set up data listener
    tcpScannerService.on("dataGot", (data) => {
      logger.success(`📥 Scanner data received: "${data}"`);
    });

    tcpScannerService.on("error", (error) => {
      logger.error(`❌ Scanner error: ${error.message}`);
    });

    // Initialize connection
    await tcpScannerService.initTcpConnection();
    logger.success("✅ TCP scanner connected successfully");

    // Get connection status
    const status = tcpScannerService.getStatus();
    logger.info("📊 Scanner Status:", status);

    // Test if scanner is ready
    logger.info(`🔍 Scanner ready: ${tcpScannerService.isReady()}`);

    // Keep the connection alive for testing
    logger.info("⏳ Waiting for scanner data... (Press Ctrl+C to exit)");

    // Optional: Send a test command if your scanner supports it
    // await tcpScannerService.sendCommand("SCAN");
  } catch (error) {
    logger.error("❌ TCP scanner test failed:", error);

    if (error.message.includes("ECONNREFUSED")) {
      logger.error("💡 Troubleshooting tips:");
      logger.error("   1. Check if the TCP scanner is powered on");
      logger.error("   2. Verify the scanner's IP address and port");
      logger.error("   3. Check network connectivity");
      logger.error("   4. Ensure no firewall is blocking the connection");
    }
  }

  // Cleanup function
  process.on("SIGINT", async () => {
    logger.info("🧹 Cleaning up TCP scanner connection...");
    try {
      await tcpScannerService.closeConnection();
      logger.info("✅ TCP scanner connection closed");
    } catch (error) {
      logger.error("❌ Error closing TCP scanner:", error);
    }
    process.exit(0);
  });
}

// Run the test
testTcpScanner().catch((error) => {
  logger.error("❌ Test execution failed:", error);
  process.exit(1);
});
