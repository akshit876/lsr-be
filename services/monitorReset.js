import { parentPort } from "worker_threads";
import logger from "../logger.js";
import { readBit } from "./modbus.js";
import { resetBits } from "./testCycle.js";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function monitorResetSignal() {
  logger.info("Reset signal monitor started and waiting for start signal");

  // Wait for start signal from main thread
  await new Promise((resolve) => {
    parentPort.once("message", (message) => {
      if (message === "start") {
        logger.info("Received start signal, beginning monitoring");
        resolve();
      }
    });
  });

  while (true) {
    try {
      // Request main thread to read the reset bit
      parentPort.postMessage({ type: "readBit", register: 1600, bit: 0 });

      // Wait for response from main thread
      const resetSignal = await new Promise((resolve) => {
        parentPort.once("message", (message) => {
          if (message.type === "bitValue") {
            resolve(message.value);
          }
        });
      });

      if (resetSignal) {
        logger.info("Reset signal detected at 1600.0");
        parentPort.postMessage({ type: "reset" });
        // await resetBits();

        // Wait for the bit to be cleared
        while (true) {
          parentPort.postMessage({ type: "readBit", register: 1600, bit: 0 });
          const bitValue = await new Promise((resolve) => {
            parentPort.once("message", (message) => {
              if (message.type === "bitValue") {
                resolve(message.value);
              }
            });
          });
          if (!bitValue) break;
          await sleep(100);
        }
        logger.info("Reset signal cleared");
      }
    } catch (error) {
      logger.error("Error in monitorResetSignal:", error);
      await sleep(1000);
    }
    await sleep(50); // Small delay between checks
  }
}

monitorResetSignal().catch((error) => {
  logger.error("Fatal error in monitorResetSignal:", error);
  process.exit(1);
});
