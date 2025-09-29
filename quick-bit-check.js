#!/usr/bin/env node

/**
 * Quick PLC Bit Check Script
 *
 * A simple script to quickly check specific bits in PLC registers.
 * Perfect for debugging and troubleshooting.
 */

import {
  connect,
  readBit,
  readRegister,
  disconnect,
} from "./services/modbus.js";
import logger from "./logger.js";

// Common register definitions for this system
const REGISTER_DEFINITIONS = {
  1410: {
    name: "Control Signals",
    bits: {
      0: "Start signal",
      1: "OCR read trigger",
      2: "Laser data transfer signal",
      3: "Scanner read trigger",
      11: "File transfer signal",
      12: "Cycle completion signal",
    },
  },
  1414: {
    name: "Status Signals",
    bits: {
      3: "Data match OK",
      4: "Data match NG",
      6: "First scan OK",
      7: "First scan NG",
      15: "File transfer signal",
    },
  },
  1415: {
    name: "Additional Control",
    bits: {
      0: "Scanner trigger",
      4: "File transfer confirmation",
      7: "Cycle completion",
    },
  },
  1490: {
    name: "Safety Signals",
    bits: {
      0: "Part not present",
      1: "Emergency stop",
      2: "Safety sensor not engaged",
    },
  },
  1600: {
    name: "Reset Signal",
    bits: {
      0: "Reset signal",
    },
  },
};

async function quickBitCheck(register, bit = null) {
  try {
    await connect();
    logger.info(`\n🔍 Checking Register ${register}...`);

    // Get register info
    const regInfo = REGISTER_DEFINITIONS[register];
    if (regInfo) {
      logger.info(`📋 ${regInfo.name}`);
    }

    if (bit !== null) {
      // Check specific bit
      const bitValue = await readBit(register, bit, false);
      const bitName = regInfo?.bits?.[bit] || "Unknown";

      logger.info(
        `   Bit ${bit}: ${bitValue ? "🟢 ON" : "🔴 OFF"} - ${bitName}`
      );
    } else {
      // Check all bits
      const [registerValue] = await readRegister(register, 1);
      const binaryString = registerValue.toString(2).padStart(16, "0");

      logger.info(
        `   Value: ${registerValue} (0x${registerValue.toString(16).toUpperCase()})`
      );
      logger.info(`   Binary: ${binaryString}`);

      // Show only ON bits with descriptions
      const onBits = [];
      for (let i = 0; i < 16; i++) {
        const bitValue = (registerValue & (1 << i)) !== 0;
        if (bitValue) {
          const bitName = regInfo?.bits?.[i] || "Unknown";
          onBits.push(`${i}(${bitName})`);
        }
      }

      if (onBits.length > 0) {
        logger.info(`   🔥 ON Bits: ${onBits.join(", ")}`);
      } else {
        logger.info(`   ❄️  All bits are OFF`);
      }
    }
  } catch (error) {
    logger.error(`❌ Error: ${error.message}`);
  } finally {
    await disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const register = parseInt(args[0]);
const bit = args[1] ? parseInt(args[1]) : null;

if (!register || isNaN(register)) {
  logger.info(`
🔧 Quick PLC Bit Check

Usage:
  node quick-bit-check.js <register> [bit]

Examples:
  node quick-bit-check.js 1410          # Check all bits in register 1410
  node quick-bit-check.js 1410 0        # Check bit 0 in register 1410
  node quick-bit-check.js 1414 7        # Check bit 7 in register 1414
  node quick-bit-check.js 1600 0        # Check reset signal

Common Registers:
  1410 - Control signals
  1414 - Status signals  
  1415 - Additional control
  1490 - Safety signals
  1600 - Reset signal
  `);
  process.exit(1);
}

// Run the check
quickBitCheck(register, bit);
