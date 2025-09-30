#!/usr/bin/env node

/**
 * Standalone Alarm Service
 * Runs independently to monitor safety violations and emit real-time alerts
 */

import AlarmService from "./services/AlarmService.js";
import logger from "./logger.js";
import process from "process";

async function startAlarmService() {
  logger.info("🚨 Starting Standalone Alarm Service");
  logger.info("=".repeat(50));

  const alarmService = new AlarmService(3001);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    logger.info("🛑 Received SIGINT, shutting down Alarm Service...");
    alarmService.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("🛑 Received SIGTERM, shutting down Alarm Service...");
    alarmService.stop();
    process.exit(0);
  });

  // Start the service
  const success = await alarmService.start();

  if (success) {
    logger.success("✅ Alarm Service is running!");
    logger.info("📡 Socket.IO server listening on port 3001");
    logger.info("🔍 Monitoring PLC registers: 1490.0, 1490.1, 1490.2");
    logger.info(
      "📋 Available events: safety_violation, alarm_triggered, alarm_cleared, alarm_status"
    );
    logger.info("🛑 Press Ctrl+C to stop");

    // Log status every 30 seconds
    setInterval(() => {
      const status = alarmService.getStatus();
      logger.info(
        `📊 Status: Running=${status.isRunning}, Clients=${status.connectedClients}, Alarms=${JSON.stringify(status.lastAlarmStates)}`
      );
    }, 30000);
  } else {
    logger.error("❌ Failed to start Alarm Service");
    process.exit(1);
  }
}

// Start the service
startAlarmService().catch((error) => {
  logger.error("❌ Alarm Service startup failed:", error);
  process.exit(1);
});
