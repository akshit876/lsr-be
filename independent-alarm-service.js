#!/usr/bin/env node

/**
 * Completely Independent Alarm Service
 * No dependencies on existing modbus.js or other services
 */

import IndependentAlarmService from "./services/IndependentAlarmService.js";
import logger from "./logger.js";
import process from "process";

async function startIndependentAlarmService() {
  logger.info("🚨 Starting Completely Independent Alarm Service");
  logger.info("=".repeat(60));

  // Configuration - can be set via environment variables
  const config = {
    port: parseInt(process.env.ALARM_PORT) || 3001,
    plcHost: process.env.MODBUS_IP || "192.168.3.146",
    plcPort: parseInt(process.env.MODBUS_PORT) || 502,
  };

  logger.info(`📡 Service Port: ${config.port}`);
  logger.info(`🔌 PLC Host: ${config.plcHost}`);
  logger.info(`🔌 PLC Port: ${config.plcPort}`);

  const alarmService = new IndependentAlarmService(config.port, {
    host: config.plcHost,
    port: config.plcPort,
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    logger.info(
      "🛑 Received SIGINT, shutting down Independent Alarm Service..."
    );
    alarmService.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info(
      "🛑 Received SIGTERM, shutting down Independent Alarm Service..."
    );
    alarmService.stop();
    process.exit(0);
  });

  // Start the service
  const success = await alarmService.start();

  if (success) {
    logger.success("✅ Independent Alarm Service is running!");
    logger.info("📡 Socket.IO server listening on port " + config.port);
    logger.info("🔍 Monitoring PLC registers: 1490.0, 1490.1, 1490.2");
    logger.info(
      "📋 Available events: safety_violation, alarm_triggered, alarm_cleared, alarm_status"
    );
    logger.info("🔌 Independent Modbus connection established");
    logger.info("🛑 Press Ctrl+C to stop");

    // Log status every 30 seconds
    setInterval(() => {
      const status = alarmService.getStatus();
      logger.info(
        `📊 Status: Running=${status.isRunning}, Clients=${status.connectedClients}, PLC=${status.plcConnected}, Alarms=${JSON.stringify(status.lastAlarmStates)}`
      );
    }, 30000);
  } else {
    logger.error("❌ Failed to start Independent Alarm Service");
    process.exit(1);
  }
}

// Start the service
startIndependentAlarmService().catch((error) => {
  logger.error("❌ Independent Alarm Service startup failed:", error);
  process.exit(1);
});
