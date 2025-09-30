#!/usr/bin/env node

/**
 * Debug test for alarm service - shows detailed bit information
 */

import { io } from "socket.io-client";
import logger from "./logger.js";

function testAlarmDebug() {
  logger.info("🔍 Debug Test - Alarm Service");
  logger.info("=".repeat(50));

  const socket = io("http://localhost:3001");

  socket.on("connect", () => {
    logger.success("✅ Connected to Alarm Service");
    logger.info("🔍 Monitoring bit changes and alarm triggers...");
    logger.info("📊 Turn PLC bits ON/OFF to see the behavior");
  });

  socket.on("safety_violation", (data) => {
    const now = new Date();
    logger.error(`🚨 SAFETY VIOLATION DETECTED at ${now.toISOString()}:`);
    logger.error(`   Violation: ${data.violation}`);
    logger.error(`   Register: ${data.register}`);
    logger.error(`   Value: ${data.value}`);
    logger.error(`   Severity: ${data.severity}`);
    logger.error(`   Action: ${data.action}`);
    logger.error(`   Service: ${data.service}`);
    logger.error(`   Event Time: ${data.timestamp}`);
  });

  socket.on("disconnect", () => {
    logger.warn("❌ Disconnected from Alarm Service");
  });

  socket.on("connect_error", (error) => {
    logger.error("❌ Connection error:", error.message);
  });

  // Test for 60 seconds
  setTimeout(() => {
    logger.info("⏰ Debug test completed (60 seconds)");
    socket.disconnect();
    process.exit(0);
  }, 60000);

  logger.info("🛑 Press Ctrl+C to stop test early");
  logger.info("📋 Instructions:");
  logger.info("   1. Turn ON a safety bit on PLC");
  logger.info("   2. Check if alarm comes immediately");
  logger.info("   3. Turn OFF the safety bit");
  logger.info("   4. Check if alarm stops coming");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("🛑 Stopping debug test...");
  process.exit(0);
});

testAlarmDebug();
