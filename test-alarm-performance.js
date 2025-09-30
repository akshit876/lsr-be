#!/usr/bin/env node

/**
 * Performance test to measure alarm response time
 */

import { io } from "socket.io-client";
import logger from "./logger.js";

function testAlarmPerformance() {
  logger.info("⚡ Testing Alarm Service Performance");
  logger.info("=".repeat(50));

  const socket = io("http://localhost:3001");
  let alarmCount = 0;
  let totalDelay = 0;
  let minDelay = Infinity;
  let maxDelay = 0;

  socket.on("connect", () => {
    logger.success("✅ Connected to Alarm Service");
    logger.info("🔍 Monitoring alarm response times...");
    logger.info("📊 Will measure delay from PLC bit change to UI event");
  });

  socket.on("safety_violation", (data) => {
    const now = Date.now();
    const eventTime = new Date(data.timestamp).getTime();
    const delay = now - eventTime;

    alarmCount++;
    totalDelay += delay;
    minDelay = Math.min(minDelay, delay);
    maxDelay = Math.max(maxDelay, delay);

    logger.error(`🚨 ALARM #${alarmCount} - Delay: ${delay}ms`);
    logger.error(`   Violation: ${data.violation}`);
    logger.error(`   Register: ${data.register}`);
    logger.error(`   Event Time: ${data.timestamp}`);
    logger.error(`   Received Time: ${new Date(now).toISOString()}`);

    if (alarmCount >= 10) {
      const avgDelay = totalDelay / alarmCount;
      logger.info("\n📊 PERFORMANCE SUMMARY:");
      logger.info(`   Total Alarms: ${alarmCount}`);
      logger.info(`   Average Delay: ${avgDelay.toFixed(2)}ms`);
      logger.info(`   Min Delay: ${minDelay}ms`);
      logger.info(`   Max Delay: ${maxDelay}ms`);

      if (avgDelay < 200) {
        logger.success("✅ EXCELLENT: Average delay < 200ms");
      } else if (avgDelay < 500) {
        logger.info("⚠️ GOOD: Average delay < 500ms");
      } else {
        logger.warn("❌ SLOW: Average delay > 500ms - needs optimization");
      }

      socket.disconnect();
      process.exit(0);
    }
  });

  socket.on("disconnect", () => {
    logger.warn("❌ Disconnected from Alarm Service");
  });

  socket.on("connect_error", (error) => {
    logger.error("❌ Connection error:", error.message);
  });

  // Test for 60 seconds max
  setTimeout(() => {
    if (alarmCount === 0) {
      logger.warn("⚠️ No alarms received in 60 seconds");
    } else {
      const avgDelay = totalDelay / alarmCount;
      logger.info("\n📊 FINAL PERFORMANCE SUMMARY:");
      logger.info(`   Total Alarms: ${alarmCount}`);
      logger.info(`   Average Delay: ${avgDelay.toFixed(2)}ms`);
      logger.info(`   Min Delay: ${minDelay}ms`);
      logger.info(`   Max Delay: ${maxDelay}ms`);
    }
    socket.disconnect();
    process.exit(0);
  }, 60000);

  logger.info("🛑 Press Ctrl+C to stop test early");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("🛑 Stopping performance test...");
  process.exit(0);
});

testAlarmPerformance();
