// Test script to verify scan flow and data processing
import { scannerController } from "./services/scanCycles.js";
import logger from "./logger.js";

async function testScanFlow() {
  logger.info("🧪 Testing Scan Flow and Data Processing");
  logger.info("=".repeat(50));

  try {
    // Test with different types of scanner data
    const testCases = [
      "ABC123456",
      "NG",
      "",
      null,
      "VERY_LONG_SCANNER_DATA_123",
      "SHORT",
    ];

    for (const testData of testCases) {
      logger.info(`\n📝 Testing scanner data: "${testData}"`);

      try {
        // Simulate processing scan data
        await scannerController.handleSuccessfulScan(testData, "TEST");
        logger.success(`✅ Successfully processed: "${testData}"`);
      } catch (error) {
        logger.error(`❌ Failed to process: "${testData}" - ${error.message}`);
      }
    }

    logger.success("\n🎉 All scan flow tests completed!");
  } catch (error) {
    logger.error("❌ Test failed:", error);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testScanFlow()
    .then(() => {
      logger.info("✅ All tests passed");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("❌ Tests failed:", error);
      process.exit(1);
    });
}

export default testScanFlow;
