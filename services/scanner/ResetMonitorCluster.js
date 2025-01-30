import cluster from "cluster";
import { EventEmitter } from "events";
import logger from "../../logger.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ResetMonitorCluster extends EventEmitter {
  constructor() {
    super();
    this.worker = null;
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      logger.warn("Reset monitor cluster is already running");
      return;
    }

    try {
      if (cluster.isPrimary) {
        this.setupWorker();
      }

      this.isRunning = true;
      logger.info("Reset monitor cluster started");
    } catch (error) {
      logger.error("Failed to start reset monitor cluster:", error);
      throw error;
    }
  }

  setupWorker() {
    // Set up the worker file path
    const workerPath = path.join(__dirname, "resetMonitor.worker.js");

    // Fork a new worker
    this.worker = cluster.fork({
      WORKER_FILE: workerPath,
    });

    // Handle worker messages
    this.worker.on("message", (message) => {
      switch (message.type) {
        case "RESET_DETECTED":
          this.emit("reset");
          break;
        case "ERROR":
          logger.error("Reset monitor worker error:", message.message);
          this.restartWorker();
          break;
        default:
          logger.warn("Unknown message from reset monitor worker:", message);
      }
    });

    // Handle worker errors and exits
    this.worker.on("error", (error) => {
      logger.error("Reset monitor worker error:", error);
      this.restartWorker();
    });

    this.worker.on("exit", (code, signal) => {
      if (code !== 0) {
        logger.error(
          `Reset monitor worker exited with code ${code}, signal: ${signal}`
        );
        this.restartWorker();
      }
    });

    // Start monitoring
    this.worker.send("START");
  }

  async restartWorker() {
    logger.info("Restarting reset monitor worker...");
    if (this.worker) {
      this.worker.kill();
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.setupWorker();
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      if (this.worker) {
        this.worker.kill();
        this.worker = null;
      }

      this.isRunning = false;
      this.removeAllListeners();
      logger.info("Reset monitor cluster stopped");
    } catch (error) {
      logger.error("Error stopping reset monitor cluster:", error);
      throw error;
    }
  }
}
