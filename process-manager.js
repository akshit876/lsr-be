#!/usr/bin/env node

/**
 * Process Manager - Runs Main Server + Alarm Service in Parallel
 * This ensures both services start together and restart if one fails
 */

import { spawn } from "child_process";
import logger from "./logger.js";
import process from "process";

class ProcessManager {
  constructor() {
    this.processes = new Map();
    this.restartCounts = new Map();
    this.maxRestarts = 5;
    this.restartDelay = 2000; // 2 seconds
  }

  startService(name, command, args = [], options = {}) {
    logger.info(`🚀 Starting ${name}...`);

    const childProcess = spawn(command, args, {
      stdio: "inherit",
      shell: true,
      ...options,
    });

    this.processes.set(name, childProcess);
    this.restartCounts.set(name, 0);

    childProcess.on("exit", (code, signal) => {
      logger.warn(`⚠️ ${name} exited with code ${code}, signal ${signal}`);

      if (signal === "SIGTERM" || signal === "SIGINT") {
        logger.info(`🛑 ${name} stopped gracefully`);
        return;
      }

      // Restart if not manually stopped
      this.restartService(name, command, args, options);
    });

    childProcess.on("error", (error) => {
      logger.error(`❌ ${name} error:`, error);
      this.restartService(name, command, args, options);
    });

    return childProcess;
  }

  restartService(name, command, args, options) {
    const restartCount = this.restartCounts.get(name) || 0;

    if (restartCount >= this.maxRestarts) {
      logger.error(
        `❌ ${name} exceeded max restarts (${this.maxRestarts}), stopping...`
      );
      return;
    }

    this.restartCounts.set(name, restartCount + 1);

    logger.info(
      `🔄 Restarting ${name} in ${this.restartDelay}ms (attempt ${restartCount + 1}/${this.maxRestarts})`
    );

    setTimeout(() => {
      this.startService(name, command, args, options);
    }, this.restartDelay);
  }

  stopAll() {
    logger.info("🛑 Stopping all services...");

    for (const [name, childProcess] of this.processes) {
      logger.info(`🛑 Stopping ${name}...`);
      childProcess.kill("SIGTERM");
    }

    // Force kill after 5 seconds
    setTimeout(() => {
      for (const [name, childProcess] of this.processes) {
        if (!childProcess.killed) {
          logger.warn(`⚠️ Force killing ${name}...`);
          childProcess.kill("SIGKILL");
        }
      }
      process.exit(0);
    }, 5000);
  }

  getStatus() {
    const status = {};
    for (const [name, childProcess] of this.processes) {
      status[name] = {
        running: !childProcess.killed,
        pid: childProcess.pid,
        restartCount: this.restartCounts.get(name) || 0,
      };
    }
    return status;
  }
}

async function startAllServices() {
  logger.info("🚀 Starting Process Manager");
  logger.info("=".repeat(50));

  const manager = new ProcessManager();

  // Start Main Server
  manager.startService("Main Server", "node", ["server.js"], {
    env: { ...process.env, NODE_ENV: "production" },
  });

  // Wait a bit for main server to start
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Start Independent Alarm Service
  manager.startService(
    "Alarm Service",
    "node",
    ["independent-alarm-service.js"],
    {
      env: { ...process.env, NODE_ENV: "production" },
    }
  );

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    logger.info("🛑 Received SIGINT, shutting down all services...");
    manager.stopAll();
  });

  process.on("SIGTERM", () => {
    logger.info("🛑 Received SIGTERM, shutting down all services...");
    manager.stopAll();
  });

  // Log status every 30 seconds
  setInterval(() => {
    const status = manager.getStatus();
    logger.info(`📊 Services Status: ${JSON.stringify(status)}`);
  }, 30000);

  logger.success(
    "✅ Process Manager started - both services running in parallel!"
  );
  logger.info("🛑 Press Ctrl+C to stop all services");
}

startAllServices().catch((error) => {
  logger.error("❌ Process Manager failed:", error);
  process.exit(1);
});
