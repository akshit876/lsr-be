#!/usr/bin/env node

/**
 * Test script to verify the Independent Alarm Service state tracking behavior
 * This script simulates the alarm service behavior to ensure it only emits
 * events when alarms start/end, not continuously.
 */

import IndependentAlarmService from "./services/IndependentAlarmService.js";
import logger from "./logger.js";

class AlarmServiceTester {
  constructor() {
    this.alarmService = null;
    this.eventCounts = {
      safety_violation: 0,
      safety_violation_cleared: 0,
    };
    this.lastEventTime = {};
  }

  async start() {
    logger.info("🧪 Starting Alarm Service State Tracking Test...");

    // Create alarm service instance
    this.alarmService = new IndependentAlarmService(3006, {
      host: "192.168.72.143",
      port: 502,
    });

    // Setup event listeners
    this.setupEventListeners();

    // Start the service
    const started = await this.alarmService.start();
    if (!started) {
      logger.error("❌ Failed to start alarm service for testing");
      return;
    }

    logger.info("✅ Alarm service started for testing");
    logger.info("📊 Monitoring events for 30 seconds...");

    // Monitor for 30 seconds
    setTimeout(() => {
      this.printResults();
      this.stop();
    }, 30000);
  }

  setupEventListeners() {
    // Listen for safety violation events
    this.alarmService.io.on("safety_violation", (data) => {
      this.eventCounts.safety_violation++;
      this.lastEventTime.safety_violation = new Date().toISOString();
      logger.info(
        `🚨 Safety Violation Event #${this.eventCounts.safety_violation}:`,
        {
          violation: data.violation,
          value: data.value,
          timestamp: data.timestamp,
        }
      );
    });

    // Listen for safety violation cleared events
    this.alarmService.io.on("safety_violation_cleared", (data) => {
      this.eventCounts.safety_violation_cleared++;
      this.lastEventTime.safety_violation_cleared = new Date().toISOString();
      logger.info(
        `✅ Safety Violation Cleared Event #${this.eventCounts.safety_violation_cleared}:`,
        {
          violation: data.violation,
          value: data.value,
          timestamp: data.timestamp,
        }
      );
    });

    // Listen for alarm errors
    this.alarmService.io.on("alarm_error", (data) => {
      logger.error("❌ Alarm Error:", data);
    });
  }

  printResults() {
    logger.info("\n📊 Test Results:");
    logger.info("================");
    logger.info(
      `Safety Violation Events: ${this.eventCounts.safety_violation}`
    );
    logger.info(
      `Safety Violation Cleared Events: ${this.eventCounts.safety_violation_cleared}`
    );
    logger.info(
      `Total Events: ${this.eventCounts.safety_violation + this.eventCounts.safety_violation_cleared}`
    );

    if (this.lastEventTime.safety_violation) {
      logger.info(
        `Last Safety Violation: ${this.lastEventTime.safety_violation}`
      );
    }
    if (this.lastEventTime.safety_violation_cleared) {
      logger.info(
        `Last Safety Violation Cleared: ${this.lastEventTime.safety_violation_cleared}`
      );
    }

    // Analyze the results
    const totalEvents =
      this.eventCounts.safety_violation +
      this.eventCounts.safety_violation_cleared;
    const expectedMaxEvents = 10; // Should be much less than 300 (30 seconds * 10 events/second)

    if (totalEvents > expectedMaxEvents) {
      logger.error(
        `❌ FAIL: Too many events (${totalEvents}). Expected < ${expectedMaxEvents}`
      );
      logger.error(
        "   This indicates the service is still emitting events continuously."
      );
    } else {
      logger.success(
        `✅ PASS: Event count (${totalEvents}) is within expected range`
      );
      logger.success(
        "   The service is properly tracking state and not emitting duplicate events."
      );
    }
  }

  stop() {
    if (this.alarmService) {
      this.alarmService.stop();
      logger.info("🛑 Test completed and alarm service stopped");
    }
    process.exit(0);
  }
}

// Handle process termination
process.on("SIGINT", () => {
  logger.info("\n🛑 Test interrupted by user");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("\n🛑 Test terminated");
  process.exit(0);
});

// Start the test
const tester = new AlarmServiceTester();
tester.start().catch((error) => {
  logger.error("❌ Test failed:", error);
  process.exit(1);
});
