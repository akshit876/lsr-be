import logger from "../../logger.js";
import { readBit } from "../modbus.js";
import { EventEmitter } from "events";

export class ResetMonitor extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.monitorInterval = null;
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.monitorInterval = setInterval(async () => {
      try {
        const resetSignal = await readBit(1600, 0);
        if (resetSignal) {
          this.emit("reset");
        }
      } catch (error) {
        logger.error("Error in reset monitor:", error);
      }
    }, 100);
  }

  async stop() {
    this.isRunning = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  async terminate() {
    await this.stop();
    this.removeAllListeners();
  }
}
