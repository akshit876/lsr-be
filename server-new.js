#!/usr/bin/env node

/**
 * New Server Implementation - Clean Architecture
 *
 * This is a clean, race-condition-free implementation of the laser marking system.
 * It uses proper design patterns and state management.
 */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import logger from "./logger.js";
import ScanCycleManager, {
  ScanCycleState,
} from "./services/ScanCycleManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LaserMarkingServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.scanCycleManager = null;
    this.isRunning = false;
    this.port = process.env.PORT || 3000;
  }

  async initialize() {
    try {
      logger.info("🚀 Initializing Laser Marking Server...");

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup Socket.IO
      this.setupSocketIO();

      // Initialize scan cycle manager
      this.scanCycleManager = new ScanCycleManager(this.io);
      await this.scanCycleManager.initialize();

      logger.success("✅ Server initialized successfully");
    } catch (error) {
      logger.error("❌ Failed to initialize server:", error.message);
      throw error;
    }
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, "public")));
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        scanCycleManager: this.scanCycleManager?.getStatus() || null,
      });
    });

    // Status endpoint
    this.app.get("/status", (req, res) => {
      const status = this.scanCycleManager?.getStatus() || null;
      res.json({
        server: {
          isRunning: this.isRunning,
          uptime: process.uptime(),
        },
        scanCycleManager: status,
      });
    });

    // Start scan cycle endpoint
    this.app.post("/start", async (req, res) => {
      try {
        if (!this.scanCycleManager) {
          return res
            .status(500)
            .json({ error: "Scan cycle manager not initialized" });
        }

        if (this.scanCycleManager.isRunning) {
          return res
            .status(400)
            .json({ error: "Scan cycle manager is already running" });
        }

        // Start scan cycle manager in background
        this.scanCycleManager.start().catch((error) => {
          logger.error("❌ Error in scan cycle manager:", error.message);
        });

        res.json({ message: "Scan cycle manager started successfully" });
      } catch (error) {
        logger.error("❌ Error starting scan cycle manager:", error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // Stop scan cycle endpoint
    this.app.post("/stop", async (req, res) => {
      try {
        if (!this.scanCycleManager) {
          return res
            .status(500)
            .json({ error: "Scan cycle manager not initialized" });
        }

        await this.scanCycleManager.stop();
        res.json({ message: "Scan cycle manager stopped successfully" });
      } catch (error) {
        logger.error("❌ Error stopping scan cycle manager:", error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // Default route
    this.app.get("/", (req, res) => {
      res.json({
        message: "Laser Marking System API",
        version: "2.0.0",
        endpoints: {
          health: "/health",
          status: "/status",
          start: "POST /start",
          stop: "POST /stop",
        },
      });
    });
  }

  setupSocketIO() {
    this.io.on("connection", (socket) => {
      logger.info(`🔌 Client connected: ${socket.id}`);

      // Send current status to new client
      if (this.scanCycleManager) {
        socket.emit("status", this.scanCycleManager.getStatus());
      }

      socket.on("disconnect", () => {
        logger.info(`🔌 Client disconnected: ${socket.id}`);
      });

      // Handle client requests
      socket.on("get-status", () => {
        if (this.scanCycleManager) {
          socket.emit("status", this.scanCycleManager.getStatus());
        }
      });
    });
  }

  async start() {
    try {
      await this.initialize();

      this.server.listen(this.port, () => {
        this.isRunning = true;
        logger.success(`🚀 Server running on port ${this.port}`);
        logger.info(`📊 Health check: http://localhost:${this.port}/health`);
        logger.info(`📊 Status: http://localhost:${this.port}/status`);
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error("❌ Failed to start server:", error.message);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`🛑 Received ${signal}, shutting down gracefully...`);

      try {
        if (this.scanCycleManager) {
          await this.scanCycleManager.stop();
        }

        this.server.close(() => {
          logger.info("✅ Server closed successfully");
          process.exit(0);
        });
      } catch (error) {
        logger.error("❌ Error during shutdown:", error.message);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }
}

// Start the server
const server = new LaserMarkingServer();
server.start().catch((error) => {
  logger.error("❌ Failed to start server:", error.message);
  process.exit(1);
});
