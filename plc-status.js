#!/usr/bin/env node

/**
 * PLC Status Dashboard
 *
 * Shows the current state of all important PLC registers at once.
 * Perfect for getting a complete overview of the system status.
 */

import { connect, readRegister, disconnect } from "./services/modbus.js";
import logger from "./logger.js";

// Define all important registers and their bit meanings
const SYSTEM_REGISTERS = {
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

class PLCStatusDashboard {
  constructor() {
    this.isConnected = false;
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

  async getRegisterStatus(register, regInfo) {
    try {
      const [value] = await readRegister(register, 1);
      const binaryString = value.toString(2).padStart(16, "0");

      const activeBits = [];
      for (let i = 0; i < 16; i++) {
        const bitValue = (value & (1 << i)) !== 0;
        if (bitValue && regInfo.bits[i]) {
          activeBits.push({
            bit: i,
            name: regInfo.bits[i],
            status: bitValue,
          });
        }
      }

      return {
        register,
        name: regInfo.name,
        value,
        hex: `0x${value.toString(16).toUpperCase()}`,
        binary: binaryString,
        activeBits,
      };
    } catch (error) {
      return {
        register,
        name: regInfo.name,
        error: error.message,
        activeBits: [],
      };
    }
  }

  async showStatus() {
    logger.info("\n📊 PLC System Status Dashboard");
    logger.info("=".repeat(60));

    const timestamp = new Date().toLocaleString();
    logger.info(`⏰ ${timestamp}\n`);

    // Read all registers in parallel
    const statusPromises = Object.entries(SYSTEM_REGISTERS).map(
      ([register, regInfo]) =>
        this.getRegisterStatus(parseInt(register), regInfo)
    );

    const statuses = await Promise.all(statusPromises);

    // Display results
    for (const status of statuses) {
      logger.info(`\n📋 Register ${status.register} - ${status.name}`);
      logger.info("─".repeat(40));

      if (status.error) {
        logger.error(`   ❌ Error: ${status.error}`);
        continue;
      }

      logger.info(`   Value: ${status.value} (${status.hex})`);
      logger.info(`   Binary: ${status.binary}`);

      if (status.activeBits.length > 0) {
        logger.info(`   🔥 Active Bits:`);
        for (const bit of status.activeBits) {
          logger.info(`      ${bit.bit}: ${bit.name} - 🟢 ON`);
        }
      } else {
        logger.info(`   ❄️  No active bits`);
      }
    }

    // Summary
    logger.info("\n📈 Summary");
    logger.info("─".repeat(40));

    const totalActiveBits = statuses.reduce(
      (sum, status) => sum + status.activeBits.length,
      0
    );
    const errorCount = statuses.filter((status) => status.error).length;

    logger.info(`   Total Active Bits: ${totalActiveBits}`);
    logger.info(`   Errors: ${errorCount}`);
    logger.info(`   Registers Checked: ${statuses.length}`);
  }

  async monitorStatus(interval = 5000) {
    logger.info(`\n🔄 Starting continuous monitoring (${interval}ms interval)`);
    logger.info("Press Ctrl+C to stop\n");

    const monitor = async () => {
      try {
        // Clear screen (works on most terminals)
        process.stdout.write("\x1B[2J\x1B[0f");

        await this.showStatus();

        if (this.isConnected) {
          setTimeout(monitor, interval);
        }
      } catch (error) {
        logger.error("❌ Error during monitoring:", error.message);
        setTimeout(monitor, interval);
      }
    };

    monitor();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const monitor = args.includes("--monitor") || args.includes("-m");
const interval = args.includes("--interval")
  ? parseInt(args[args.indexOf("--interval") + 1]) || 5000
  : 5000;

// Main execution
async function main() {
  const dashboard = new PLCStatusDashboard();

  try {
    await dashboard.connect();

    if (monitor) {
      await dashboard.monitorStatus(interval);
    } else {
      await dashboard.showStatus();
    }
  } catch (error) {
    logger.error("❌ Dashboard failed:", error.message);
    process.exit(1);
  } finally {
    if (!monitor) {
      await dashboard.disconnect();
    }
  }
}

// Handle Ctrl+C gracefully
process.on("SIGINT", async () => {
  logger.info("\n\n🛑 Stopping monitoring...");
  process.exit(0);
});

// Show help
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  logger.info(`
🔧 PLC Status Dashboard

Usage:
  node plc-status.js                    # Show current status once
  node plc-status.js --monitor          # Monitor continuously (5s interval)
  node plc-status.js --monitor --interval 2000  # Monitor with custom interval
  node plc-status.js --help             # Show this help

Options:
  --monitor, -m        Monitor continuously
  --interval <ms>      Monitoring interval in milliseconds (default: 5000)
  --help, -h           Show this help message

This dashboard shows the status of all important PLC registers:
  - 1410: Control signals (start, triggers, etc.)
  - 1414: Status signals (scan results, etc.)  
  - 1415: Additional control signals
  - 1490: Safety signals (emergency stop, sensors, etc.)
  - 1600: Reset signal
  `);
  process.exit(0);
}

// Run the dashboard
main().catch((error) => {
  logger.error("❌ Unhandled error:", error);
  process.exit(1);
});
