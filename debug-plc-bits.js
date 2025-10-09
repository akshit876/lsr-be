#!/usr/bin/env node

/**
 * Debug script to check actual PLC register values
 * This will help us understand the bit structure
 */

import { ModbusRTU } from "modbus-serial";
import logger from "./logger.js";

async function debugPLCBits() {
  logger.info("🔍 Debugging PLC Register 1490");
  logger.info("=".repeat(40));

  const client = new ModbusRTU();

  try {
    // Connect to PLC
    await client.connectTCP("192.168.72.143", { port: 502 });
    client.setTimeout(5000);

    logger.success("✅ Connected to PLC");

    // Read register 1490 multiple times to see the pattern
    for (let i = 0; i < 10; i++) {
      try {
        const result = await client.readHoldingRegisters(1490, 1);
        const value = result.data[0];

        // Extract individual bits
        const bit0 = (value >> 0) & 1;
        const bit1 = (value >> 1) & 1;
        const bit2 = (value >> 2) & 1;
        const bit3 = (value >> 3) & 1;
        const bit4 = (value >> 4) & 1;
        const bit5 = (value >> 5) & 1;
        const bit6 = (value >> 6) & 1;
        const bit7 = (value >> 7) & 1;

        logger.info(`📊 Register 1490 = ${value} (0x${value.toString(16)})`);
        logger.info(
          `   Bit 0: ${bit0} | Bit 1: ${bit1} | Bit 2: ${bit2} | Bit 3: ${bit3}`
        );
        logger.info(
          `   Bit 4: ${bit4} | Bit 5: ${bit5} | Bit 6: ${bit6} | Bit 7: ${bit7}`
        );
        logger.info(`   Binary: ${value.toString(2).padStart(8, "0")}`);
        logger.info("---");

        // Wait 1 second between reads
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`❌ Error reading register: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error(`❌ Connection failed: ${error.message}`);
  } finally {
    client.close();
    logger.info("🔌 Disconnected from PLC");
  }
}

debugPLCBits();
