#!/usr/bin/env node

/**
 * Test script for Middle Scan NG (No Code Found) functionality
 * This script simulates the middle scan NG detection and cycle restart
 */

import { ScannerController } from "./services/scanCycles.js";
import logger from "./logger.js";

async function testMiddleScanNG() {
  logger.info("🧪 Testing Middle Scan NG (No Code Found) Feature");
  logger.info("=".repeat(60));

  try {
    // Create scanner controller instance
    const scannerController = new ScannerController();

    // Mock IO object to capture events
    const mockIO = {
      emit: (eventName, data) => {
        logger.info(`📡 UI Event Emitted: ${eventName}`);
        if (eventName === "no_code_found") {
          logger.info(`❌ No Code Found Error: ${data.message}`);
        }
        logger.info(`📋 Event Data:`, JSON.stringify(data, null, 2));
        logger.info("-".repeat(40));
      },
    };

    // Set mock IO
    scannerController.io = mockIO;
    scannerController.cycleCount = 456; // Set a test cycle count

    logger.info("🔍 Testing handleMiddleScan with NG response...");

    // Mock the fetchScannerData method to return NG
    const originalFetchScannerData = scannerController.fetchScannerData;
    scannerController.fetchScannerData = async (service, options) => {
      logger.info(
        `🔧 Mocked fetchScannerData returning "NG" for ${options?.scanType || "unknown"} scan`
      );
      return "NG";
    };

    // Mock the saveToMongoDB method
    scannerController.saveToMongoDB = async (data) => {
      logger.info(`💾 Mocked saveToMongoDB called with:`, data);
    };

    // Test the middle scan with NG response
    logger.info("\n🧪 Testing middle scan with NG response...");
    const result = await scannerController.handleMiddleScan();

    // Verify the result
    logger.info("\n📊 Test Results:");
    logger.info(`   shouldContinue: ${result.shouldContinue}`);
    logger.info(`   markingData: ${result.markingData}`);

    if (result.shouldContinue === false) {
      logger.success("✅ Test PASSED: Cycle correctly stopped on NG response");
    } else {
      logger.error("❌ Test FAILED: Cycle should have been stopped");
    }

    // Test with null/undefined response
    logger.info("\n🧪 Testing middle scan with null response...");
    scannerController.fetchScannerData = async (service, options) => {
      logger.info(
        `🔧 Mocked fetchScannerData returning null for ${options?.scanType || "unknown"} scan`
      );
      return null;
    };

    const result2 = await scannerController.handleMiddleScan();
    logger.info(`   shouldContinue: ${result2.shouldContinue}`);
    logger.info(`   markingData: ${result2.markingData}`);

    if (result2.shouldContinue === false) {
      logger.success(
        "✅ Test PASSED: Cycle correctly stopped on null response"
      );
    } else {
      logger.error("❌ Test FAILED: Cycle should have been stopped");
    }

    // Test with empty string response
    logger.info("\n🧪 Testing middle scan with empty string response...");
    scannerController.fetchScannerData = async (service, options) => {
      logger.info(
        `🔧 Mocked fetchScannerData returning empty string for ${options?.scanType || "unknown"} scan`
      );
      return "";
    };

    const result3 = await scannerController.handleMiddleScan();
    logger.info(`   shouldContinue: ${result3.shouldContinue}`);
    logger.info(`   markingData: ${result3.markingData}`);

    if (result3.shouldContinue === false) {
      logger.success(
        "✅ Test PASSED: Cycle correctly stopped on empty string response"
      );
    } else {
      logger.error("❌ Test FAILED: Cycle should have been stopped");
    }

    logger.success("✅ Middle Scan NG feature test completed!");
    logger.info("📋 Check the events above to see the UI notifications");
    logger.info(
      "🔄 Note: In actual operation, the cycle would stop and restart when no code found"
    );
  } catch (error) {
    logger.error("❌ Test failed:", error);
  }
}

// Run the test
testMiddleScanNG().catch((error) => {
  logger.error("❌ Test execution failed:", error);
  process.exit(1);
});
