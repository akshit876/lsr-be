import { readBit } from "./services/modbus.js";
import logger from "./logger.js";

async function testEmergencyStop() {
  logger.section("Testing Emergency Stop Detection");

  try {
    logger.info("🔍 Reading emergency stop bit 1490.1...");

    // Read emergency stop bit multiple times
    for (let i = 0; i < 10; i++) {
      const emergencyStop = await readBit(1490, 1);
      logger.info(
        `Emergency Stop (1490.1): ${emergencyStop ? "🚨 ACTIVE" : "✅ INACTIVE"} - Test ${i + 1}`
      );

      if (emergencyStop) {
        logger.error("🚨 EMERGENCY STOP IS ACTIVE!");
        logger.error("This should trigger safety violation immediately!");
      }

      // Wait 100ms between readings
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info("✅ Emergency stop test completed");
  } catch (error) {
    logger.error("❌ Error testing emergency stop:", error);
  }
}

// Run the test
testEmergencyStop();
