import { scannerController } from "./services/scanCycles.js";
import mongoDbService from "./services/mongoDbService.js";
import logger from "./logger.js";

async function testManualEntryWorkflow() {
  try {
    logger.info("🧪 Testing Manual Entry Workflow for New Machine...");

    // Initialize the scanner controller
    await scannerController.initialize();

    // Test manual data examples
    const testManualData = [
      "P5314775:57386:TTA:D25154:VR0003",
      "MANUAL_CODE_123456",
      "TEST_BARCODE_001",
    ];

    logger.info(
      `📋 Testing with ${testManualData.length} manual data entries...`
    );

    for (let i = 0; i < testManualData.length; i++) {
      const manualData = testManualData[i];
      logger.separator.hash();
      logger.info(`🔄 Test ${i + 1}: Manual Entry = "${manualData}"`);

      try {
        // Simulate the manual entry workflow
        logger.info("📝 Simulating manual data entry...");

        // Generate barcode from manual data
        const barcodeResult =
          await scannerController.generateManualEntryBarcode(manualData);

        if (barcodeResult) {
          logger.success(`✅ Barcode generated successfully:`);
          logger.info(`   - Text: ${barcodeResult.text}`);
          logger.info(`   - Serial: ${barcodeResult.serialNo}`);

          // Complete the cycle
          await scannerController.completeManualEntryCycle(barcodeResult, true);
          logger.success(`✅ Manual entry cycle ${i + 1} completed`);
        } else {
          logger.error(`❌ Failed to generate barcode for: ${manualData}`);
        }

        // Add delay between tests
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error(`❌ Error in test ${i + 1}:`, error);
        await scannerController.completeManualEntryCycle(
          null,
          false,
          error.message
        );
      }
    }

    // Show final statistics
    logger.separator.hash();
    logger.info("📊 Test Summary:");
    logger.info(`   - Total cycles completed: ${scannerController.cycleCount}`);

    // Check database records
    await mongoDbService.connect("main-data", "records");
    const recentRecords = await mongoDbService.getRecentRecords(5);
    logger.info(`   - Recent database records: ${recentRecords.length}`);

    recentRecords.forEach((record, index) => {
      logger.info(
        `     ${index + 1}. ${record.MarkingData} (${record.Result})`
      );
    });

    logger.success("🎉 Manual entry workflow test completed!");
  } catch (error) {
    logger.error("❌ Error in manual entry workflow test:", error);
    process.exit(1);
  } finally {
    // Cleanup
    await mongoDbService.disconnect();
    await scannerController.cleanup();
    process.exit(0);
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  logger.info("👋 Process interrupted, cleaning up...");
  await mongoDbService.disconnect();
  await scannerController.cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("👋 Process terminated, cleaning up...");
  await mongoDbService.disconnect();
  await scannerController.cleanup();
  process.exit(0);
});

// Run the test
logger.info("🚀 Starting Manual Entry Workflow Test...");
testManualEntryWorkflow();
