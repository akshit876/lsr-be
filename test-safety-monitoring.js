import { readBit } from "./services/modbus.js";
import logger from "./logger.js";

async function testSafetyMonitoring() {
  logger.section("Testing Safety Monitoring");

  try {
    logger.info("🔍 Reading safety bits from register 1490...");

    // Read all safety bits
    const [partPresent, emergencyStop, safetySensor] = await Promise.all([
      readBit(1490, 0), // Part present
      readBit(1490, 1), // Emergency stop
      readBit(1490, 2), // Safety sensor
    ]);

    logger.info("📊 Safety Bits Status:");
    logger.info(
      `   - Part Present (1490.0): ${partPresent ? "✅ YES" : "❌ NO"}`
    );
    logger.info(
      `   - Emergency Stop (1490.1): ${emergencyStop ? "🚨 ACTIVE" : "✅ INACTIVE"}`
    );
    logger.info(
      `   - Safety Sensor (1490.2): ${safetySensor ? "✅ ENGAGED" : "❌ INTERRUPTED"}`
    );

    // Check for violations
    if (!partPresent) {
      logger.error("🚨 SAFETY VIOLATION: Part not present!");
    }

    if (emergencyStop) {
      logger.error("🚨 SAFETY VIOLATION: Emergency stop is active!");
    }

    if (!safetySensor) {
      logger.error("🚨 SAFETY VIOLATION: Safety sensor interrupted!");
    }

    if (partPresent && !emergencyStop && safetySensor) {
      logger.success("✅ All safety conditions are met");
    }
  } catch (error) {
    logger.error("❌ Error testing safety monitoring:", error);
  }
}

// Run the test
testSafetyMonitoring();
