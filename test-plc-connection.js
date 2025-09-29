#!/usr/bin/env node

/**
 * Test PLC Connection and Bit Reading
 *
 * This script tests if the system can connect to the PLC and read bits.
 * Use this to diagnose why bit 1410.0 detection is failing.
 */

import {
  connect,
  readBit,
  readRegister,
  disconnect,
} from "./services/modbus.js";
import logger from "./logger.js";

async function testPLCConnection() {
  try {
    logger.info("🔌 Testing PLC connection...");
    await connect();
    logger.success("✅ Connected to PLC successfully");

    // Test reading register 1410
    logger.info("📊 Testing register 1410 reading...");
    try {
      const [registerValue] = await readRegister(1410, 1);
      logger.info(
        `   Register 1410 value: ${registerValue} (0x${registerValue.toString(16).toUpperCase()})`
      );
      logger.info(`   Binary: ${registerValue.toString(2).padStart(16, "0")}`);
    } catch (error) {
      logger.error(`❌ Error reading register 1410: ${error.message}`);
    }

    // Test reading bit 1410.0 specifically
    logger.info("🔍 Testing bit 1410.0 reading...");
    try {
      const bitValue = await readBit(1410, 0, false);
      logger.info(`   Bit 1410.0 value: ${bitValue ? "ON (1)" : "OFF (0)"}`);
    } catch (error) {
      logger.error(`❌ Error reading bit 1410.0: ${error.message}`);
    }

    // Test reading all bits in register 1410
    logger.info("🔍 Testing all bits in register 1410...");
    try {
      const [registerValue] = await readRegister(1410, 1);
      logger.info(`   Register 1410 value: ${registerValue}`);

      for (let i = 0; i < 16; i++) {
        const bitValue = (registerValue & (1 << i)) !== 0;
        if (bitValue) {
          logger.info(`   Bit ${i}: ON (1)`);
        }
      }
    } catch (error) {
      logger.error(`❌ Error reading all bits: ${error.message}`);
    }

    // Continuous monitoring for 10 seconds
    logger.info("⏱️ Monitoring bit 1410.0 for 10 seconds...");
    const startTime = Date.now();
    const endTime = startTime + 10000; // 10 seconds

    while (Date.now() < endTime) {
      try {
        const bitValue = await readBit(1410, 0, false);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        logger.info(
          `   [${elapsed}s] Bit 1410.0: ${bitValue ? "ON (1)" : "OFF (0)"}`
        );

        if (bitValue) {
          logger.success("🎉 Bit 1410.0 became ON!");
          break;
        }
      } catch (error) {
        logger.error(`❌ Error during monitoring: ${error.message}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    }

    logger.info("✅ PLC connection test completed");
  } catch (error) {
    logger.error("❌ PLC connection test failed:", error.message);
  } finally {
    try {
      await disconnect();
      logger.info("🔌 Disconnected from PLC");
    } catch (error) {
      logger.error("❌ Error disconnecting from PLC:", error.message);
    }
  }
}

// Run the test
testPLCConnection();
