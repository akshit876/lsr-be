import { alarmMonitor } from "./services/alarmMonitor.js";
import logger from "./logger.js";

async function testSimpleAlarm() {
  logger.section("Testing Simple Alarm System");

  try {
    // Set up mock Socket.IO
    const mockIO = {
      emit: (event, data) => {
        logger.info(`📡 Emitted ${event}: ${JSON.stringify(data)}`);
      },
    };

    alarmMonitor.setSocketIO(mockIO);

    // Start monitoring
    logger.info("🚨 Starting alarm monitoring...");
    alarmMonitor.startMonitoring();

    // Simulate checking for alarms
    logger.info("⏳ Checking for alarms for 30 seconds...");
    logger.info("💡 To test alarms, manually activate the PLC bits:");
    logger.info("   - Part not present: 1490.0");
    logger.info("   - Emergency stop: 1490.1");
    logger.info("   - Safety sensor: 1490.2");

    for (let i = 0; i < 30; i++) {
      await alarmMonitor.checkForAlarms();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Stop monitoring
    logger.info("🛑 Stopping alarm monitoring...");
    alarmMonitor.stopMonitoring();

    logger.success("✅ Simple alarm test completed");
  } catch (error) {
    logger.error("❌ Error during alarm test:", error);
  } finally {
    alarmMonitor.cleanup();
    process.exit(0);
  }
}

testSimpleAlarm();
