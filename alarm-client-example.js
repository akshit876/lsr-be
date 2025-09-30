#!/usr/bin/env node

/**
 * Example client for connecting to the Alarm Service
 * This shows how to connect and listen for alarm events
 */

import { io } from "socket.io-client";
import logger from "./logger.js";
import process from "process";

function createAlarmClient() {
  logger.info("🔌 Connecting to Alarm Service...");

  // Connect to the alarm service
  const socket = io("http://localhost:3001");

  // Connection events
  socket.on("connect", () => {
    logger.success("✅ Connected to Alarm Service");

    // Request current alarm status
    socket.emit("request_alarm_status");
  });

  socket.on("disconnect", () => {
    logger.warn("⚠️ Disconnected from Alarm Service");
  });

  socket.on("connect_error", (error) => {
    logger.error("❌ Connection error:", error.message);
  });

  // Alarm events
  socket.on("safety_violation", (data) => {
    logger.error(`🚨 SAFETY VIOLATION: ${data.violation}`);
    logger.error(`   Register: ${data.register}, Value: ${data.value}`);
    logger.error(`   Severity: ${data.severity}, Action: ${data.action}`);

    // Handle the alarm in your UI
    handleSafetyViolation(data);
  });

  socket.on("alarm_triggered", (data) => {
    logger.warn(`⚠️ ALARM TRIGGERED: ${data.alarmType}`);
    logger.warn(`   Severity: ${data.severity}`);

    // Handle the alarm trigger in your UI
    handleAlarmTriggered(data);
  });

  socket.on("alarm_cleared", (data) => {
    logger.success(`✅ ALARM CLEARED: ${data.message}`);

    // Handle alarm clear in your UI
    handleAlarmCleared(data);
  });

  socket.on("alarm_status", (data) => {
    logger.info(`📊 Alarm Status: ${data.status}`);
    logger.info(`   Active Alarms: ${data.activeAlarms?.join(", ") || "None"}`);
    logger.info(`   Alarms: ${JSON.stringify(data.alarms)}`);

    // Update UI with current status
    updateAlarmStatus(data);
  });

  socket.on("alarm_error", (data) => {
    logger.error(`❌ ALARM ERROR: ${data.error}`);
    logger.error(`   Message: ${data.message}`);

    // Handle alarm service errors
    handleAlarmError(data);
  });

  return socket;
}

// UI handling functions (replace with your actual UI code)
function handleSafetyViolation(data) {
  // Example: Show alert dialog
  console.log("🚨 Show safety violation alert:", data);

  // Example: Update UI indicators
  console.log("🔴 Update UI to show critical alarm state");

  // Example: Play alarm sound
  console.log("🔊 Play alarm sound");
}

function handleAlarmTriggered(data) {
  // Example: Show notification
  console.log("⚠️ Show alarm notification:", data);

  // Example: Update alarm panel
  console.log("📋 Update alarm panel in UI");
}

function handleAlarmCleared(data) {
  // Example: Clear alarm indicators
  console.log("✅ Clear alarm indicators in UI");

  // Example: Show success message
  console.log("🎉 Show alarm cleared message");
}

function updateAlarmStatus(data) {
  // Example: Update status dashboard
  console.log("📊 Update status dashboard:", data);

  // Example: Update alarm indicators
  console.log("💡 Update alarm indicator lights");
}

function handleAlarmError(data) {
  // Example: Show connection error
  console.log("❌ Show connection error in UI:", data);

  // Example: Attempt reconnection
  console.log("🔄 Attempt to reconnect to alarm service");
}

// Start the client
const socket = createAlarmClient();

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("🛑 Disconnecting from Alarm Service...");
  socket.disconnect();
  process.exit(0);
});

logger.info("🔌 Alarm Client started");
logger.info("📡 Listening for alarm events...");
logger.info("🛑 Press Ctrl+C to stop");
