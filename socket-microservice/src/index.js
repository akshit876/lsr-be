#!/usr/bin/env node

import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { logger } from "./utils/logger.js";
import { ModbusService } from "./services/modbusService.js";
import { SocketEventService } from "./services/socketEventService.js";
import { EventEmitterService } from "./services/eventEmitterService.js";
import { HealthService } from "./services/healthService.js";
import { config } from "./config/index.js";

// Load environment variables
dotenv.config();

class SocketMicroservice {
  constructor() {
    this.server = null;
    this.io = null;
    this.modbusService = null;
    this.socketEventService = null;
    this.eventEmitterService = null;
    this.healthService = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info("🚀 Initializing Socket Microservice...");

      // Step 1: Initialize Modbus service
      await this.initializeModbus();

      // Step 2: Create HTTP server and Socket.IO
      this.createServer();

      // Step 3: Initialize services
      await this.initializeServices();

      // Step 4: Setup socket event handlers
      this.setupSocketHandlers();

      // Step 5: Setup HTTP endpoints
      this.setupHttpEndpoints();

      // Step 6: Start listening
      await this.startServer();

      this.isInitialized = true;
      logger.success("✅ Socket Microservice initialized successfully");
    } catch (error) {
      logger.error("❌ Failed to initialize Socket Microservice:", error);
      throw error;
    }
  }

  async initializeModbus() {
    try {
      logger.info("🔌 Initializing Modbus service...");
      this.modbusService = new ModbusService();
      await this.modbusService.initialize();
      logger.success("✅ Modbus service initialized");
    } catch (error) {
      logger.error("❌ Modbus service initialization failed:", error);
      throw error;
    }
  }

  createServer() {
    this.server = createServer();
    this.io = new Server(this.server, {
      cors: {
        origin: config.cors.origin,
        methods: config.cors.methods,
        credentials: config.cors.credentials,
      },
      transports: ["websocket", "polling"],
      allowEIO3: true,
    });

    logger.info("🌐 HTTP server and Socket.IO created");
  }

  async initializeServices() {
    try {
      // Initialize socket event service
      this.socketEventService = new SocketEventService(this.modbusService);
      await this.socketEventService.initialize();
      logger.info("✅ Socket event service initialized");

      // Initialize event emitter service
      this.eventEmitterService = new EventEmitterService(this.io);
      await this.eventEmitterService.initialize();
      logger.info("✅ Event emitter service initialized");

      // Initialize health service
      this.healthService = new HealthService(this.modbusService);
      await this.healthService.initialize();
      logger.info("✅ Health service initialized");
    } catch (error) {
      logger.error("❌ Service initialization failed:", error);
      throw error;
    }
  }

  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      logger.info(`🔌 New client connected: ${socket.id}`);

      // Setup all socket event handlers
      this.socketEventService.setupEventHandlers(socket);

      socket.on("disconnect", () => {
        logger.info(`🔌 Client disconnected: ${socket.id}`);
      });
    });

    logger.info("📡 Socket event handlers configured");
  }

  setupHttpEndpoints() {
    // Health check endpoint
    this.server.on("request", async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // Set CORS headers
      res.setHeader("Access-Control-Allow-Origin", config.cors.origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Content-Type", "application/json");

      // Handle preflight requests
      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      try {
        if (url.pathname === "/health") {
          if (req.method === "GET") {
            const health = await this.healthService.healthCheck();
            res.writeHead(200);
            res.end(JSON.stringify(health));
          } else {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
          }
        } else if (url.pathname === "/status") {
          if (req.method === "GET") {
            const status = {
              isInitialized: this.isInitialized,
              uptime: process.uptime(),
              timestamp: new Date().toISOString(),
              services: {
                modbus: this.modbusService?.getStatus(),
                socketEvent: this.socketEventService?.getStatus(),
                eventEmitter: {
                  connectedClients:
                    this.eventEmitterService?.getConnectedClientsCount() || 0,
                  groups: this.eventEmitterService?.getGroupMembersCount() || 0,
                },
              },
            };
            res.writeHead(200);
            res.end(JSON.stringify(status));
          } else {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
          }
        } else if (url.pathname === "/emit") {
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk.toString();
            });

            req.on("end", () => {
              try {
                const { event, data, target, targetType } = JSON.parse(body);

                if (!event) {
                  res.writeHead(400);
                  res.end(JSON.stringify({ error: "Event name is required" }));
                  return;
                }

                let result;
                switch (targetType) {
                  case "client":
                    result = this.eventEmitterService.emitToClient(
                      target,
                      event,
                      data
                    );
                    break;
                  case "group":
                    result = this.eventEmitterService.emitToGroup(
                      target,
                      event,
                      data
                    );
                    break;
                  case "all":
                  default:
                    result = this.eventEmitterService.emitToAll(event, data);
                    break;
                }

                res.writeHead(200);
                res.end(
                  JSON.stringify({
                    success: true,
                    event,
                    targetType: targetType || "all",
                    target: target || "all",
                    clientsReached: result,
                  })
                );
              } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Invalid JSON payload" }));
              }
            });
          } else {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
          }
        } else if (url.pathname === "/") {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              service: "LSR Socket Microservice",
              version: "1.0.0",
              status: "running",
              timestamp: new Date().toISOString(),
              endpoints: {
                health: "/health",
                status: "/status",
                emit: "/emit (POST)",
              },
            })
          );
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Endpoint not found" }));
        }
      } catch (error) {
        logger.error("HTTP endpoint error:", error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });

    logger.info("🌐 HTTP endpoints configured");
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      this.server.listen(config.server.port, (err) => {
        if (err) {
          logger.error("❌ Socket service failed to start:", err.message);
          reject(err);
          return;
        }

        logger.success(
          `✅ Socket Microservice listening on port ${config.server.port}`
        );
        resolve();
      });
    });
  }

  async shutdown() {
    logger.info("🔄 Shutting down Socket Microservice...");

    try {
      if (this.socketEventService) {
        await this.socketEventService.shutdown();
      }

      if (this.eventEmitterService) {
        await this.eventEmitterService.shutdown();
      }

      if (this.healthService) {
        await this.healthService.shutdown();
      }

      if (this.modbusService) {
        await this.modbusService.shutdown();
      }

      if (this.io) {
        this.io.close();
        logger.info("✅ Socket.IO closed");
      }

      if (this.server) {
        this.server.close();
        logger.info("✅ HTTP server closed");
      }

      logger.info("✅ Socket Microservice shutdown complete");
    } catch (error) {
      logger.error("❌ Error during shutdown:", error);
    }
  }

  // Public methods for external event emission

  emitToAll(event, data) {
    if (this.eventEmitterService) {
      return this.eventEmitterService.emitToAll(event, data);
    }
    return 0;
  }

  emitToGroup(groupName, event, data) {
    if (this.eventEmitterService) {
      return this.eventEmitterService.emitToGroup(groupName, event, data);
    }
    return 0;
  }

  emitToClient(socketId, event, data) {
    if (this.eventEmitterService) {
      return this.eventEmitterService.emitToClient(socketId, event, data);
    }
    return false;
  }

  // Convenience methods for common events

  emitSystemStatus(status) {
    if (this.eventEmitterService) {
      return this.eventEmitterService.emitSystemStatus(status);
    }
    return null;
  }

  emitPlcStatus(status) {
    if (this.eventEmitterService) {
      return this.eventEmitterService.emitPlcStatus(status);
    }
    return null;
  }

  emitScannerEvent(eventType, data) {
    if (this.eventEmitterService) {
      return this.eventEmitterService.emitScannerEvent(eventType, data);
    }
    return null;
  }

  emitProductionEvent(eventType, data) {
    if (this.eventEmitterService) {
      return this.eventEmitterService.emitProductionEvent(eventType, data);
    }
    return null;
  }

  emitErrorEvent(errorType, errorMessage, details) {
    if (this.eventEmitterService) {
      return this.eventEmitterService.emitErrorEvent(
        errorType,
        errorMessage,
        details
      );
    }
    return null;
  }

  emitNotification(notificationType, message, priority, targetGroup) {
    if (this.eventEmitterService) {
      return this.eventEmitterService.emitNotification(
        notificationType,
        message,
        priority,
        targetGroup
      );
    }
    return null;
  }
}

// Create and export singleton instance
const socketMicroservice = new SocketMicroservice();

// Graceful shutdown handling
process.on("SIGINT", async () => {
  logger.info("Received SIGINT. Shutting down Socket Microservice...");
  await socketMicroservice.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM. Shutting down Socket Microservice...");
  await socketMicroservice.shutdown();
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("💥 Uncaught Exception:", {
    message: error.message,
    stack: error.stack,
    name: error.name,
  });
  // Don't exit immediately, give time for logging
  setTimeout(() => process.exit(1), 1000);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("💥 Unhandled Rejection:", {
    reason:
      reason instanceof Error
        ? {
            message: reason.message,
            stack: reason.stack,
            name: reason.name,
          }
        : reason,
    promise: promise.toString(),
  });
  // Don't exit immediately, give time for logging
  setTimeout(() => process.exit(1), 1000);
});

// Main execution
async function main() {
  try {
    await socketMicroservice.initialize();

    logger.success("🎉 Socket Microservice is running!");
    logger.info(`📡 Socket.IO listening on port ${config.server.port}`);
    logger.info("🔌 Ready to handle PLC control events");
    logger.info("📤 Ready to emit backend events to clients");

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    logger.error("💥 Failed to start Socket Microservice:", error);
    process.exit(1);
  }
}

// Start the microservice
main().catch((error) => {
  logger.error("💥 Fatal error in main:", error);
  process.exit(1);
});

export default socketMicroservice;
