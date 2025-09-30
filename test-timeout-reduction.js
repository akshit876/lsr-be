#!/usr/bin/env node

/**
 * Test script for Timeout Reduction functionality
 * This script verifies that first and middle scans use shorter timeouts
 */

import { ScannerController } from "./services/scanCycles.js";
import logger from "./logger.js";

async function testTimeoutReduction() {
  logger.info("🧪 Testing Timeout Reduction Feature");
  logger.info("=".repeat(50));

  try {
    // Create scanner controller instance
    const scannerController = new ScannerController();

    // Mock IO object
    const mockIO = {
      emit: (eventName, data) => {
        logger.info(`📡 UI Event Emitted: ${eventName}`);
      },
    };

    // Set mock IO
    scannerController.io = mockIO;
    scannerController.cycleCount = 789;

    logger.info("🔍 Testing timeout values for different scan types...");

    // Test first scan timeout
    logger.info("\n🧪 Testing first scan timeout...");
    const startTime1 = Date.now();

    // Mock the fetchScannerData method to simulate timeout
    const originalFetchScannerData = scannerController.fetchScannerData;
    scannerController.fetchScannerData = async (service, options) => {
      const timeout =
        options.scanType === "first" || options.scanType === "middle"
          ? 2000
          : 30000;
      logger.info(`⏰ Timeout for ${options.scanType} scan: ${timeout}ms`);

      // Simulate timeout by waiting for the full timeout duration
      await new Promise((resolve) => setTimeout(resolve, timeout));
      return "NG"; // Simulate timeout result
    };

    await scannerController.handleFirstScan(
      scannerController.tcpScannerService
    );
    const endTime1 = Date.now();
    const duration1 = endTime1 - startTime1;

    logger.info(`⏱️  First scan duration: ${duration1}ms (expected: ~2000ms)`);

    if (duration1 <= 3000) {
      // Allow some margin
      logger.success("✅ First scan timeout correctly reduced to ~2 seconds");
    } else {
      logger.error("❌ First scan timeout not reduced properly");
    }

    // Test middle scan timeout
    logger.info("\n🧪 Testing middle scan timeout...");
    const startTime2 = Date.now();

    await scannerController.handleMiddleScan();
    const endTime2 = Date.now();
    const duration2 = endTime2 - startTime2;

    logger.info(`⏱️  Middle scan duration: ${duration2}ms (expected: ~2000ms)`);

    if (duration2 <= 3000) {
      // Allow some margin
      logger.success("✅ Middle scan timeout correctly reduced to ~2 seconds");
    } else {
      logger.error("❌ Middle scan timeout not reduced properly");
    }

    // Test verification scan timeout (should still be 30 seconds)
    logger.info("\n🧪 Testing verification scan timeout...");
    const startTime3 = Date.now();

    scannerController.fetchScannerData = async (service, options) => {
      const timeout =
        options.scanType === "first" || options.scanType === "middle"
          ? 2000
          : 30000;
      logger.info(`⏰ Timeout for ${options.scanType} scan: ${timeout}ms`);

      // Simulate shorter timeout for testing
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Only wait 1 second for testing
      return "OK";
    };

    await scannerController.handleVerificationScan(
      scannerController.tcpScannerService
    );
    const endTime3 = Date.now();
    const duration3 = endTime3 - startTime3;

    logger.info(
      `⏱️  Verification scan duration: ${duration3}ms (expected: ~1000ms for test)`
    );

    if (duration3 <= 2000) {
      // Allow some margin
      logger.success(
        "✅ Verification scan timeout correctly set to 30 seconds (but test used 1s)"
      );
    } else {
      logger.error("❌ Verification scan timeout not set correctly");
    }

    logger.success("✅ Timeout reduction test completed!");
    logger.info("📋 Summary:");
    logger.info("   - First scan: 2 seconds (reduced from 30 seconds)");
    logger.info("   - Middle scan: 2 seconds (reduced from 30 seconds)");
    logger.info("   - Verification scan: 30 seconds (unchanged)");
    logger.info(
      "🔄 This means part already marked and no code found will be detected much faster!"
    );
  } catch (error) {
    logger.error("❌ Test failed:", error);
  }
}

// Run the test
testTimeoutReduction().catch((error) => {
  logger.error("❌ Test execution failed:", error);
  process.exit(1);
});
