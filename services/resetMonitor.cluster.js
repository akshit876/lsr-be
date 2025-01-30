import cluster from "cluster";
import { readBit } from "./modbus.js";
import logger from "../logger.js";

if (cluster.isWorker) {
  logger.info("Reset monitor started");

  async function monitorReset() {
    while (true) {
      try {
        const resetSignal = await readBit(1600, 0);
        if (resetSignal) {
          process.send({ type: "RESET_DETECTED" });
        }
        await sleep(50); // 50ms polling interval
      } catch (error) {
        logger.error("Reset monitor error:", error);
      }
    }
  }

  monitorReset();
}
