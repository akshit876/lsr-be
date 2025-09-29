#!/usr/bin/env node

/* eslint-env node */

/**
 * PLC Bit Monitor Script
 *
 * This script allows you to check which bits are on in PLC registers.
 * It can monitor single registers, multiple registers, or specific bit positions.
 *
 * Usage:
 *   node check-plc-bits.js --register 1410 --bits 0,1,2,3
 *   node check-plc-bits.js --register 1410 --all-bits
 *   node check-plc-bits.js --register 1410,1414,1490 --all-bits
 *   node check-plc-bits.js --monitor 1410 --interval 1000
 */

import {
  connect,
  readBit,
  readRegister,
  disconnect,
} from "./services/modbus.js";
import logger from "./logger.js";

class PLCBitMonitor {
  constructor() {
    this.isConnected = false;
    this.monitoring = false;
  }

  async connect() {
    try {
      await connect();
      this.isConnected = true;
      logger.info("✅ Connected to PLC");
    } catch (error) {
      logger.error("❌ Failed to connect to PLC:", error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      await disconnect();
      this.isConnected = false;
      logger.info("✅ Disconnected from PLC");
    } catch (error) {
      logger.error("❌ Error disconnecting from PLC:", error.message);
    }
  }

  /**
   * Read a single register and show all bit states
   */
  async readRegisterBits(register) {
    try {
      const [registerValue] = await readRegister(register, 1);
      const binaryString = registerValue.toString(2).padStart(16, "0");

      logger.info(`\n📊 Register ${register} Analysis:`);
      logger.info(`   Decimal Value: ${registerValue}`);
      logger.info(
        `   Hex Value: 0x${registerValue.toString(16).toUpperCase()}`
      );
      logger.info(`   Binary: ${binaryString}`);

      // Show which bits are ON (1)
      const onBits = [];
      for (let i = 0; i < 16; i++) {
        const bitValue = (registerValue & (1 << i)) !== 0;
        if (bitValue) {
          onBits.push(i);
        }
      }

      if (onBits.length > 0) {
        logger.info(`   🔥 ON Bits: ${onBits.join(", ")}`);
      } else {
        logger.info(`   ❄️  All bits are OFF`);
      }

      return {
        register,
        value: registerValue,
        binary: binaryString,
        onBits,
      };
    } catch (error) {
      logger.error(`❌ Error reading register ${register}:`, error.message);
      throw error;
    }
  }

  /**
   * Read specific bits from a register
   */
  async readSpecificBits(register, bitPositions) {
    try {
      logger.info(`\n📊 Register ${register} - Specific Bits:`);

      const results = {};
      for (const bit of bitPositions) {
        try {
          const bitValue = await readBit(register, bit, false);
          results[bit] = bitValue;
          logger.info(`   Bit ${bit}: ${bitValue ? "🟢 ON" : "🔴 OFF"}`);
        } catch (error) {
          logger.error(`   Bit ${bit}: ❌ Error - ${error.message}`);
          results[bit] = null;
        }
      }

      return results;
    } catch (error) {
      logger.error(
        `❌ Error reading specific bits from register ${register}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Monitor register(s) continuously
   */
  async startMonitoring(registers, interval = 1000) {
    this.monitoring = true;
    logger.info(`\n🔄 Starting continuous monitoring...`);
    logger.info(`   Registers: ${registers.join(", ")}`);
    logger.info(`   Interval: ${interval}ms`);
    logger.info(`   Press Ctrl+C to stop\n`);

    while (this.monitoring) {
      try {
        const timestamp = new Date().toLocaleTimeString();
        logger.info(`\n⏰ ${timestamp} - Register Status:`);

        for (const register of registers) {
          const result = await this.readRegisterBits(register);

          // Show a compact status line
          const status =
            result.onBits.length > 0
              ? `ON bits: ${result.onBits.join(",")}`
              : "All OFF";
          logger.info(`   ${register}: ${status}`);
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
      } catch (error) {
        logger.error("❌ Error during monitoring:", error.message);
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }
  }

  stopMonitoring() {
    this.monitoring = false;
    logger.info("\n🛑 Monitoring stopped");
  }

  /**
   * Show help information
   */
  showHelp() {
    logger.info(`
🔧 PLC Bit Monitor - Usage Examples:

1. Check all bits in a single register:
   node check-plc-bits.js --register 1410 --all-bits

2. Check specific bits in a register:
   node check-plc-bits.js --register 1410 --bits 0,1,2,3

3. Check multiple registers:
   node check-plc-bits.js --register 1410,1414,1490 --all-bits

4. Monitor register continuously:
   node check-plc-bits.js --monitor 1410 --interval 2000

5. Monitor multiple registers:
   node check-plc-bits.js --monitor 1410,1414,1490 --interval 1000

Common PLC Registers in this system:
  1410 - Control signals (start, triggers, etc.)
  1414 - Status signals (scan results, etc.)
  1415 - Additional control signals
  1490 - Safety signals (emergency stop, sensors, etc.)
  1600 - Reset signal
  3000+ - Data registers

Options:
  --register <registers>  Comma-separated list of registers to check
  --bits <bits>          Comma-separated list of bit positions (0-15)
  --all-bits             Check all 16 bits in the register
  --monitor <registers>  Continuously monitor registers
  --interval <ms>        Monitoring interval in milliseconds (default: 1000)
  --help                 Show this help message
    `);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    registers: [],
    bits: [],
    allBits: false,
    monitor: false,
    interval: 1000,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--register":
        if (i + 1 < args.length) {
          options.registers = args[i + 1]
            .split(",")
            .map((r) => parseInt(r.trim()));
          i++;
        }
        break;
      case "--bits":
        if (i + 1 < args.length) {
          options.bits = args[i + 1].split(",").map((b) => parseInt(b.trim()));
          i++;
        }
        break;
      case "--all-bits":
        options.allBits = true;
        break;
      case "--monitor":
        if (i + 1 < args.length) {
          options.registers = args[i + 1]
            .split(",")
            .map((r) => parseInt(r.trim()));
          options.monitor = true;
          i++;
        }
        break;
      case "--interval":
        if (i + 1 < args.length) {
          options.interval = parseInt(args[i + 1]);
          i++;
        }
        break;
      case "--help":
        options.help = true;
        break;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  const monitor = new PLCBitMonitor();

  // Handle help
  if (options.help || options.registers.length === 0) {
    monitor.showHelp();
    return;
  }

  try {
    await monitor.connect();

    if (options.monitor) {
      // Continuous monitoring
      await monitor.startMonitoring(options.registers, options.interval);
    } else {
      // Single check
      for (const register of options.registers) {
        if (options.allBits) {
          await monitor.readRegisterBits(register);
        } else if (options.bits.length > 0) {
          await monitor.readSpecificBits(register, options.bits);
        } else {
          // Default: show all bits
          await monitor.readRegisterBits(register);
        }
      }
    }
  } catch (error) {
    logger.error("❌ Script failed:", error.message);
    process.exit(1);
  } finally {
    await monitor.disconnect();
  }
}

// Handle Ctrl+C gracefully
process.on("SIGINT", async () => {
  logger.info("\n\n🛑 Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

// Run the script
main().catch((error) => {
  logger.error("❌ Unhandled error:", error);
  process.exit(1);
});
