import { readBit } from "./services/modbus.js";
import logger from "./logger.js";

async function testContinuousSafetyMonitoring() {
  logger.section("Testing Continuous Safety Monitoring");

  try {
    logger.info("🔍 Starting continuous safety monitoring...");
    logger.info("This will monitor safety bits every 100ms and show status");
    logger.info("Press Ctrl+C to stop the monitoring");

    let violationCount = 0;
    let lastEmergencyStop = false;
    let lastPartPresent = true;
    let lastSafetySensor = true;

    // Continuous monitoring loop
    const monitorInterval = setInterval(async () => {
      try {
        const [partPresent, emergencyStop, safetySensor] = await Promise.all([
          readBit(1490, 0), // Part present
          readBit(1490, 1), // Emergency stop
          readBit(1490, 2), // Safety sensor
        ]);

        violationCount++;

        // Check for changes in safety status
        let statusChanged = false;
        let currentViolations = [];

        if (!partPresent && lastPartPresent) {
          statusChanged = true;
          currentViolations.push("Part not present");
        }
        if (emergencyStop && !lastEmergencyStop) {
          statusChanged = true;
          currentViolations.push("Emergency stop activated");
        }
        if (!safetySensor && lastSafetySensor) {
          statusChanged = true;
          currentViolations.push("Safety sensor interrupted");
        }

        // Check for safety restoration
        if (partPresent && !lastPartPresent) {
          statusChanged = true;
          logger.success("✅ Part is now present");
        }
        if (!emergencyStop && lastEmergencyStop) {
          statusChanged = true;
          logger.success("✅ Emergency stop is now deactivated");
        }
        if (safetySensor && !lastSafetySensor) {
          statusChanged = true;
          logger.success("✅ Safety sensor is now engaged");
        }

        // Update last known states
        lastPartPresent = partPresent;
        lastEmergencyStop = emergencyStop;
        lastSafetySensor = safetySensor;

        // Log current status every 10 checks (1 second)
        if (violationCount % 10 === 0) {
          logger.info(`\n📊 Safety Status Check #${violationCount}:`);
          logger.info(
            `   - Part Present (1490.0): ${partPresent ? "✅ YES" : "❌ NO"}`
          );
          logger.info(
            `   - Emergency Stop (1490.1): ${emergencyStop ? "🚨 ACTIVE" : "✅ INACTIVE"}`
          );
          logger.info(
            `   - Safety Sensor (1490.2): ${safetySensor ? "✅ ENGAGED" : "❌ INTERRUPTED"}`
          );

          if (currentViolations.length > 0) {
            logger.error(
              `🚨 Active Violations: ${currentViolations.join(", ")}`
            );
          }

          if (partPresent && !emergencyStop && safetySensor) {
            logger.success("✅ All safety conditions are met");
          }
        }

        // Simulate UI events (in real system, these would go to the UI)
        if (statusChanged) {
          if (currentViolations.length > 0) {
            logger.warn(
              `📱 UI Event: validation_error - ${currentViolations.join(", ")}`
            );
          } else {
            logger.info("📱 UI Event: safety_restored - All conditions met");
          }
        }
      } catch (error) {
        logger.error(`❌ Error in safety monitoring: ${error.message}`);
      }
    }, 100);

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      logger.info("\n🛑 Stopping safety monitoring...");
      clearInterval(monitorInterval);
      logger.success("✅ Safety monitoring stopped");
      process.exit(0);
    });
  } catch (error) {
    logger.error("❌ Error in continuous safety monitoring:", error);
  }
}

// Run the test
testContinuousSafetyMonitoring();
