import { connect, writeBit } from "./services/modbus.js";
import logger from "./logger.js";
import process from "process";

/**
 * Simple script to write a bit to PLC
 */

async function main() {
  try {
    // Connect to PLC
    logger.info("Connecting to PLC...");
    await connect();
    logger.info("Connected successfully");

    // Write bit 1414.0 = 1
    await writeBit(1414, 0, 1);
    logger.info("✅ Bit 1414.0 set to 1");

    // Wait 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Reset bit 1414.0 = 0
    await writeBit(1414, 0, 0);
    logger.info("✅ Bit 1414.0 reset to 0");
  } catch (error) {
    logger.error("Error:", error);
  }

  process.exit(0);
}

main();
