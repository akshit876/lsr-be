#!/usr/bin/env node

/**
 * Test script for Part Already Marked functionality
 * This script simulates the part already marked detection
 */

import { ScannerController } from "./services/scanCycles.js";
import logger from "./logger.js";

async function testPartAlreadyMarked() {
  logger.info("🧪 Testing Part Already Marked Feature");
  logger.info("=".repeat(50));

  try {
    // Create scanner controller instance
    const scannerController = new ScannerController();

    // Mock IO object to capture events
    const mockIO = {
      emit: (eventName, data) => {
        logger.info(`📡 UI Event Emitted: ${eventName}`);
        if (eventName === "first_scan_ok" && data.isAlreadyMarked) {
          logger.info(`⚠️  Part Already Marked Warning: ${data.message}`);
        }
        logger.info(`📋 Event Data:`, JSON.stringify(data, null, 2));
        logger.info("-".repeat(30));
      },
    };

    // Set mock IO
    scannerController.io = mockIO;
    scannerController.cycleCount = 123; // Set a test cycle count

    logger.info("🔍 Testing handlePartAlreadyMarked method...");

    // Test with different types of marking data
    const testCases = [
      "ABC123",
      "123456789",
      "PART-001",
      "SERIAL-2025-001",
      "QR_CODE_DATA",
    ];

    for (const testData of testCases) {
      logger.info(`\n🧪 Testing with data: "${testData}"`);
      await scannerController.handlePartAlreadyMarked(testData, "first");
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    }

    logger.success("✅ Part Already Marked feature test completed!");
    logger.info("📋 Check the events above to see the UI notifications");
    logger.info(
      "🔄 Note: In actual operation, the cycle would stop and restart when part is already marked"
    );
  } catch (error) {
    logger.error("❌ Test failed:", error);
  }
}

// Run the test
testPartAlreadyMarked().catch((error) => {
  logger.error("❌ Test execution failed:", error);
  process.exit(1);
});
