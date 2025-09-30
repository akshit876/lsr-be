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

  // Only listen for safety_violation events
  // Other events removed as requested

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

// Only safety_violation handler needed

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
