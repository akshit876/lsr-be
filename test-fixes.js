#!/usr/bin/env node

/**
 * Test script to verify the fixes for stuck code issues
 * This script tests the main problematic areas identified in the logs
 */

import { connect, readBit, disconnect } from "./services/modbus.js";
import logger from "./logger.js";

async function testBitReading() {
  logger.info("🧪 Testing bit reading with timeout handling...");

  try {
    await connect();
    logger.info("✅ Connected to PLC");

    // Test reading bit 1410.3 (the one that was timing out)
    logger.info("📖 Testing bit 1410.3 read...");
    const startTime = Date.now();

    try {
      const bitValue = await readBit(1410, 3, true);
      const duration = Date.now() - startTime;
      logger.info(
        `✅ Bit 1410.3 read successful: ${bitValue} (took ${duration}ms)`
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(
        `⚠️ Bit 1410.3 read failed after ${duration}ms: ${error.message}`
      );
    }

    // Test reading bit 1410.0 (the one that was working)
    logger.info("📖 Testing bit 1410.0 read...");
    const startTime2 = Date.now();

    try {
      const bitValue2 = await readBit(1410, 0, true);
      const duration2 = Date.now() - startTime2;
      logger.info(
        `✅ Bit 1410.0 read successful: ${bitValue2} (took ${duration2}ms)`
      );
    } catch (error) {
      const duration2 = Date.now() - startTime2;
      logger.warn(
        `⚠️ Bit 1410.0 read failed after ${duration2}ms: ${error.message}`
      );
    }
  } catch (error) {
    logger.error(`❌ Connection failed: ${error.message}`);
  } finally {
    try {
      await disconnect();
      logger.info("🔌 Disconnected from PLC");
    } catch (error) {
      logger.error(`❌ Error disconnecting: ${error.message}`);
    }
  }
}

async function testConnectionHealth() {
  logger.info("🏥 Testing connection health check...");

  try {
    await connect();
    logger.info("✅ Initial connection successful");

    // Test multiple reads to verify connection health
    for (let i = 0; i < 3; i++) {
      try {
        const bitValue = await readBit(1410, 0, false);
        logger.info(`✅ Health check ${i + 1}/3: Bit 1410.0 = ${bitValue}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.warn(`⚠️ Health check ${i + 1}/3 failed: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error(`❌ Health check failed: ${error.message}`);
  } finally {
    try {
      await disconnect();
      logger.info("🔌 Disconnected from PLC");
    } catch (error) {
      logger.error(`❌ Error disconnecting: ${error.message}`);
    }
  }
}

async function runTests() {
  logger.info("🚀 Starting fix verification tests...");
  logger.info("=".repeat(50));

  await testBitReading();

  logger.info("=".repeat(50));

  await testConnectionHealth();

  logger.info("=".repeat(50));
  logger.info("✅ All tests completed");
}

// Run the tests
runTests().catch((error) => {
  logger.error(`❌ Test suite failed: ${error.message}`);
  process.exit(1);
});
