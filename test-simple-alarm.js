#!/usr/bin/env node

/**
 * Simple test to verify alarm service only emits safety_violation events
 */

import { io } from "socket.io-client";
import logger from "./logger.js";

function testAlarmService() {
  logger.info("🧪 Testing Alarm Service - Safety Violations Only");
  logger.info("=".repeat(50));

  const socket = io("http://localhost:3001");

  socket.on("connect", () => {
    logger.success("✅ Connected to Alarm Service");
    logger.info("🔍 Listening for safety_violation events only...");
  });

  socket.on("disconnect", () => {
    logger.warn("❌ Disconnected from Alarm Service");
  });

  socket.on("connect_error", (error) => {
    logger.error("❌ Connection error:", error.message);
  });

  // Only listen for safety_violation events
  socket.on("safety_violation", (data) => {
    logger.error(`🚨 SAFETY VIOLATION DETECTED:`);
    logger.error(`   Violation: ${data.violation}`);
    logger.error(`   Register: ${data.register}`);
    logger.error(`   Value: ${data.value}`);
    logger.error(`   Severity: ${data.severity}`);
    logger.error(`   Action: ${data.action}`);
    logger.error(`   Service: ${data.service}`);
    logger.error(`   Timestamp: ${data.timestamp}`);
  });

  // Log any unexpected events
  socket.onAny((eventName, ...args) => {
    if (
      eventName !== "safety_violation" &&
      eventName !== "connect" &&
      eventName !== "disconnect"
    ) {
      logger.warn(`⚠️ Unexpected event received: ${eventName}`, args);
    }
  });

  // Test for 30 seconds
  setTimeout(() => {
    logger.info("⏰ Test completed (30 seconds)");
    socket.disconnect();
    process.exit(0);
  }, 30000);

  logger.info("🛑 Press Ctrl+C to stop test early");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("🛑 Stopping test...");
  process.exit(0);
});

testAlarmService();
