#!/usr/bin/env node

/**
 * New Server Implementation - Clean Architecture
 *
 * This is a clean, race-condition-free implementation of the laser marking system.
 * It uses proper design patterns and state management.
 */

/* eslint-env node */
import { createServer } from "http";
import { Server } from "socket.io";

import logger from "./logger.js";
import ScanCycleManager from "./services/ScanCycleManager.js";

class LaserMarkingServer {
  constructor() {
    this.server = createServer();
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

      // Setup HTTP routes
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

  setupRoutes() {
    this.server.on('request', (req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathname = url.pathname;
      const method = req.method;

      // Health check endpoint
      if (method === 'GET' && pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          scanCycleManager: this.scanCycleManager?.getStatus() || null,
        }));
        return;
      }

      // Status endpoint
      if (method === 'GET' && pathname === '/status') {
        const status = this.scanCycleManager?.getStatus() || null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          server: {
            isRunning: this.isRunning,
            uptime: process.uptime(),
          },
          scanCycleManager: status,
        }));
        return;
      }

      // Start scan cycle endpoint
      if (method === 'POST' && pathname === '/start') {
        this.handleStartRequest(req, res);
        return;
      }

      // Stop scan cycle endpoint
      if (method === 'POST' && pathname === '/stop') {
        this.handleStopRequest(req, res);
        return;
      }

      // Default route
      if (method === 'GET' && pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: "Laser Marking System API",
          version: "2.0.0",
          endpoints: {
            health: "/health",
            status: "/status",
            start: "POST /start",
            stop: "POST /stop",
          },
        }));
        return;
      }

      // 404 Not Found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });
  }

  async handleStartRequest(req, res) {
    try {
      if (!this.scanCycleManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Scan cycle manager not initialized" }));
        return;
      }

      if (this.scanCycleManager.isRunning) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Scan cycle manager is already running" }));
        return;
      }

      // Start scan cycle manager in background
      this.scanCycleManager.start().catch((error) => {
        logger.error("❌ Error in scan cycle manager:", error.message);
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: "Scan cycle manager started successfully" }));
    } catch (error) {
      logger.error("❌ Error starting scan cycle manager:", error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  async handleStopRequest(req, res) {
    try {
      if (!this.scanCycleManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Scan cycle manager not initialized" }));
        return;
      }

      await this.scanCycleManager.stop();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: "Scan cycle manager stopped successfully" }));
    } catch (error) {
      logger.error("❌ Error stopping scan cycle manager:", error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
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
