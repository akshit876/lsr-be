import { parentPort } from "worker_threads";
import { connect, readBit } from "../modbus.js";
import logger from "../../logger.js";

const RESET_CHECK_INTERVAL = 100; // ms
const RESET_BIT_ADDRESS = 1600;
const RESET_BIT = 0;

async function initializeModbus() {
  try {
    await connect();
    logger.info("Reset monitor: Modbus connection established");
    return true;
  } catch (error) {
    logger.error("Reset monitor: Failed to connect to Modbus:", error);
    return false;
  }
}

async function monitorResetBit() {
  if (!(await initializeModbus())) {
    parentPort.postMessage({
      type: "ERROR",
      message: "Failed to initialize Modbus",
    });
    return;
  }

  while (true) {
    try {
      const resetSignal = await readBit(RESET_BIT_ADDRESS, RESET_BIT);

      if (resetSignal) {
        parentPort.postMessage({ type: "RESET_DETECTED" });
        logger.info("Reset monitor: Reset signal detected");
      }

      await new Promise((resolve) => setTimeout(resolve, RESET_CHECK_INTERVAL));
    } catch (error) {
      logger.error("Reset monitor: Error reading reset bit:", error);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait longer on error
    }
  }
}

// Handle messages from parent
parentPort.on("message", (message) => {
  if (message === "START") {
    monitorResetBit().catch((error) => {
      logger.error("Reset monitor: Fatal error:", error);
      process.exit(1);
    });
  }
});
