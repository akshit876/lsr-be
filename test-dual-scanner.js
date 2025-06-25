import { scannerController } from "./services/scanCycles.js";
import logger from "./logger.js";

async function testDualScannerListening() {
  logger.section("Testing Dual Scanner Listening Approach");

  try {
    // Initialize the scanner controller
    logger.info("🔧 Initializing scanner controller...");
    await scannerController.initialize();
    logger.success("✅ Scanner controller initialized");

    // Test the dual-scanner listening approach
    logger.info("🎯 Testing dual-scanner listening for first scan...");

    const scannerData = await scannerController.fetchScannerData(
      scannerController.tcpScannerService,
      {
        scanType: "first",
        timeout: 10000, // 10 second timeout for testing
      }
    );

    logger.success(`✅ Test completed! Scanner data received: ${scannerData}`);

    // Test middle scan
    logger.info("🎯 Testing dual-scanner listening for middle scan...");

    const middleScannerData = await scannerController.fetchScannerData(
      scannerController.middleScannerService,
      {
        scanType: "middle",
        timeout: 10000, // 10 second timeout for testing
      }
    );

    logger.success(
      `✅ Middle scan test completed! Scanner data received: ${middleScannerData}`
    );
  } catch (error) {
    logger.error("❌ Test failed:", error);
  } finally {
    // Cleanup
    logger.info("🧹 Cleaning up...");
    await scannerController.cleanup();
    logger.success("✅ Cleanup completed");
  }
}

// Run the test
testDualScannerListening().catch(console.error);
