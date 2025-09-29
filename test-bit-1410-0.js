#!/usr/bin/env node

/**
 * Test Bit 1410.0 Reading
 *
 * Simple test to check if we can read bit 1410.0 from the PLC.
 */

import {
  connect,
  readBit,
  readRegister,
  disconnect,
} from "./services/modbus.js";
import logger from "./logger.js";

async function testBit1410_0() {
  try {
    logger.info("🔌 Connecting to PLC...");
    await connect();
    logger.success("✅ Connected to PLC");

    // Test reading register 1410
    logger.info("📊 Reading register 1410...");
    const [registerValue] = await readRegister(1410, 1);
    logger.info(
      `   Register 1410 value: ${registerValue} (0x${registerValue.toString(16).toUpperCase()})`
    );
    logger.info(`   Binary: ${registerValue.toString(2).padStart(16, "0")}`);

    // Test reading bit 1410.0
    logger.info("🔍 Reading bit 1410.0...");
    const bitValue = await readBit(1410, 0, false);
    logger.info(`   Bit 1410.0 value: ${bitValue ? "ON (1)" : "OFF (0)"}`);

    // Show all ON bits in register 1410
    logger.info("🔍 All ON bits in register 1410:");
    for (let i = 0; i < 16; i++) {
      const bitValue = (registerValue & (1 << i)) !== 0;
      if (bitValue) {
        logger.info(`   Bit ${i}: ON (1)`);
      }
    }

    logger.success("✅ Test completed successfully");
  } catch (error) {
    logger.error("❌ Test failed:", error.message);
    logger.error("Stack trace:", error.stack);
  } finally {
    try {
      await disconnect();
      logger.info("🔌 Disconnected from PLC");
    } catch (error) {
      logger.error("❌ Error disconnecting:", error.message);
    }
  }
}

// Run the test
testBit1410_0();
