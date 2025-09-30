#!/usr/bin/env node

/**
 * Test script for Safety Violations functionality
 * This script tests safety violation detection and UI event emission
 */

import { ScannerController } from "./services/scanCycles.js";
import logger from "./logger.js";

async function testSafetyViolations() {
  logger.info("🧪 Testing Safety Violations Feature");
  logger.info("=".repeat(50));

  try {
    // Create scanner controller instance
    const scannerController = new ScannerController();

    // Mock IO object to capture events
    const mockIO = {
      emit: (eventName, data) => {
        logger.info(`📡 UI Event Emitted: ${eventName}`);
        logger.info(`📋 Event Data:`, JSON.stringify(data, null, 2));
        logger.info("-".repeat(40));
      },
    };

    // Set mock IO
    scannerController.io = mockIO;
    scannerController.cycleCount = 999;

    logger.info("🔍 Testing safety violation event emission...");

    // Test part not present violation
    logger.info("\n🧪 Testing Part Not Present violation...");
    if (scannerController.io) {
      logger.info("📡 Emitting safety_violation event to UI: Part not present");
      scannerController.io.emit("safety_violation", {
        timestamp: new Date().toISOString(),
        violation: "Part not present",
        cycleNumber: scannerController.cycleCount,
        register: "1490.0",
        value: true,
      });
    }

    // Test emergency stop violation
    logger.info("\n🧪 Testing Emergency Stop violation...");
    if (scannerController.io) {
      logger.info(
        "📡 Emitting safety_violation event to UI: Emergency stop activated"
      );
      scannerController.io.emit("safety_violation", {
        timestamp: new Date().toISOString(),
        violation: "Emergency stop activated",
        cycleNumber: scannerController.cycleCount,
        register: "1490.1",
        value: true,
      });
    }

    // Test safety sensor violation
    logger.info("\n🧪 Testing Safety Sensor violation...");
    if (scannerController.io) {
      logger.info(
        "📡 Emitting safety_violation event to UI: Safety sensor not engaged"
      );
      scannerController.io.emit("safety_violation", {
        timestamp: new Date().toISOString(),
        violation: "Safety sensor not engaged",
        cycleNumber: scannerController.cycleCount,
        register: "1490.2",
        value: true,
      });
    }

    logger.success("✅ Safety violations test completed!");
    logger.info("📋 Check the events above to see the UI notifications");
    logger.info(
      "🔄 In actual operation, these events would be emitted when safety violations are detected"
    );

    // Test with no IO object
    logger.info("\n🧪 Testing with no IO object...");
    scannerController.io = null;

    if (scannerController.io) {
      logger.info("📡 This should not appear");
    } else {
      logger.warn(
        "⚠️ this.io is not available, cannot emit safety_violation event"
      );
    }
  } catch (error) {
    logger.error("❌ Test failed:", error);
  }
}

// Run the test
testSafetyViolations().catch((error) => {
  logger.error("❌ Test execution failed:", error);
  process.exit(1);
});
