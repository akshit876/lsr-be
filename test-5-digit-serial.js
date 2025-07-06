import SerialNumberGeneratorService from "./services/serialNumber.js";
import logger from "./logger.js";

async function test5DigitSerialNumbers() {
  logger.section("Testing 5-Digit Serial Number Generation");

  try {
    // Initialize the service
    logger.info("🔧 Initializing SerialNumberGeneratorService...");
    await SerialNumberGeneratorService.initialize("main-data", "records");

    // Test multiple serial number generations
    logger.info("🎯 Testing serial number generation...");

    for (let i = 1; i <= 5; i++) {
      const serialNumber =
        await SerialNumberGeneratorService.getNextDecSerialNumber2();
      logger.info(
        `   Serial ${i}: ${serialNumber} (length: ${serialNumber.length})`
      );

      // Verify it's 5 digits
      if (serialNumber.length !== 5) {
        logger.error(`❌ Serial number ${serialNumber} is not 5 digits!`);
        return false;
      }

      // Verify it starts with zeros for early numbers
      if (i === 1 && !serialNumber.startsWith("0000")) {
        logger.error(
          `❌ First serial number should start with 0000, got: ${serialNumber}`
        );
        return false;
      }
    }

    logger.success(
      "✅ All serial numbers are correctly formatted with 5 digits!"
    );
    return true;
  } catch (error) {
    logger.error("❌ Error during testing:", error);
    return false;
  }
}

// Run the test
test5DigitSerialNumbers().then((success) => {
  if (success) {
    logger.success("🎉 5-digit serial number test completed successfully!");
  } else {
    logger.error("💥 5-digit serial number test failed!");
  }
  process.exit(success ? 0 : 1);
});
