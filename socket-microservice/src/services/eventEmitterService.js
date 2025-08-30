import { logger } from "../utils/logger.js";

export class EventEmitterService {
  constructor(io) {
    this.io = io;
    this.connectedClients = new Map(); // socketId -> socket object
    this.clientGroups = new Map(); // groupName -> Set of socketIds
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info("🚀 Initializing Event Emitter Service...");

      // Setup connection tracking
      this.setupConnectionTracking();

      this.isInitialized = true;
      logger.success("✅ Event Emitter Service initialized successfully");
    } catch (error) {
      logger.error("❌ Event Emitter Service initialization failed:", error);
      throw error;
    }
  }

  setupConnectionTracking() {
    this.io.on("connection", (socket) => {
      // Track connected client
      this.connectedClients.set(socket.id, socket);
      logger.debug(
        `📱 Client connected: ${socket.id} (Total: ${this.connectedClients.size})`
      );

      // Handle client joining groups
      socket.on("join-group", (groupName) => {
        this.addClientToGroup(socket.id, groupName);
        logger.debug(`👥 Client ${socket.id} joined group: ${groupName}`);
      });

      // Handle client leaving groups
      socket.on("leave-group", (groupName) => {
        this.removeClientFromGroup(socket.id, groupName);
        logger.debug(`👥 Client ${socket.id} left group: ${groupName}`);
      });

      // Handle client identification
      socket.on("identify", (clientInfo) => {
        this.identifyClient(socket.id, clientInfo);
        logger.debug(
          `🏷️ Client ${socket.id} identified as: ${JSON.stringify(clientInfo)}`
        );
      });

      socket.on("disconnect", () => {
        this.handleClientDisconnect(socket.id);
        logger.debug(
          `📱 Client disconnected: ${socket.id} (Total: ${this.connectedClients.size})`
        );
      });
    });
  }

  // Client Management
  addClientToGroup(socketId, groupName) {
    if (!this.clientGroups.has(groupName)) {
      this.clientGroups.set(groupName, new Set());
    }
    this.clientGroups.get(groupName).add(socketId);
  }

  removeClientFromGroup(socketId, groupName) {
    const group = this.clientGroups.get(groupName);
    if (group) {
      group.delete(socketId);
      if (group.size === 0) {
        this.clientGroups.delete(groupName);
      }
    }
  }

  identifyClient(socketId, clientInfo) {
    const socket = this.connectedClients.get(socketId);
    if (socket) {
      socket.clientInfo = clientInfo;
    }
  }

  handleClientDisconnect(socketId) {
    // Remove from all groups
    for (const [groupName, group] of this.clientGroups.entries()) {
      group.delete(socketId);
      if (group.size === 0) {
        this.clientGroups.delete(groupName);
      }
    }

    // Remove from connected clients
    this.connectedClients.delete(socketId);
  }

  // Event Emission Methods

  // Emit to specific client
  emitToClient(socketId, event, data) {
    try {
      const socket = this.connectedClients.get(socketId);
      if (socket) {
        socket.emit(event, data);
        logger.debug(`📤 Emitted ${event} to client ${socketId}`);
        return true;
      } else {
        logger.warn(`⚠️ Client ${socketId} not found for event ${event}`);
        return false;
      }
    } catch (error) {
      logger.error(`❌ Failed to emit ${event} to client ${socketId}:`, error);
      return false;
    }
  }

  // Emit to all connected clients
  emitToAll(event, data) {
    try {
      this.io.emit(event, data);
      logger.debug(
        `📤 Emitted ${event} to all clients (${this.connectedClients.size})`
      );
      return this.connectedClients.size;
    } catch (error) {
      logger.error(`❌ Failed to emit ${event} to all clients:`, error);
      return 0;
    }
  }

  // Emit to specific group
  emitToGroup(groupName, event, data) {
    try {
      const group = this.clientGroups.get(groupName);
      if (group && group.size > 0) {
        const sockets = Array.from(group)
          .map((id) => this.connectedClients.get(id))
          .filter(Boolean);
        sockets.forEach((socket) => socket.emit(event, data));
        logger.debug(
          `📤 Emitted ${event} to group ${groupName} (${sockets.length} clients)`
        );
        return sockets.length;
      } else {
        logger.warn(
          `⚠️ Group ${groupName} not found or empty for event ${event}`
        );
        return 0;
      }
    } catch (error) {
      logger.error(`❌ Failed to emit ${event} to group ${groupName}:`, error);
      return 0;
    }
  }

  // Emit to clients matching criteria
  emitToClientsMatching(criteria, event, data) {
    try {
      let matchedClients = 0;

      for (const [socketId, socket] of this.connectedClients.entries()) {
        if (this.matchesCriteria(socket, criteria)) {
          socket.emit(event, data);
          matchedClients++;
        }
      }

      logger.debug(`📤 Emitted ${event} to ${matchedClients} matching clients`);
      return matchedClients;
    } catch (error) {
      logger.error(`❌ Failed to emit ${event} to matching clients:`, error);
      return 0;
    }
  }

  matchesCriteria(socket, criteria) {
    if (!socket.clientInfo) return false;

    for (const [key, value] of Object.entries(criteria)) {
      if (socket.clientInfo[key] !== value) {
        return false;
      }
    }
    return true;
  }

  // Specific Event Types

  // System Status Events
  emitSystemStatus(status) {
    const data = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    this.emitToAll("system-status", data);
    return data;
  }

  // PLC Status Events
  emitPlcStatus(status) {
    const data = {
      ...status,
      timestamp: new Date().toISOString(),
    };

    this.emitToAll("plc-status", data);
    return data;
  }

  // Scanner Events
  emitScannerEvent(eventType, data = {}) {
    const eventData = {
      type: eventType,
      ...data,
      timestamp: new Date().toISOString(),
    };

    this.emitToAll("scanner-event", eventData);
    return eventData;
  }

  // Production Events
  emitProductionEvent(eventType, data = {}) {
    const eventData = {
      type: eventType,
      ...data,
      timestamp: new Date().toISOString(),
    };

    this.emitToGroup("production", "production-event", eventData);
    return eventData;
  }

  // Error Events
  emitErrorEvent(errorType, errorMessage, details = {}) {
    const eventData = {
      type: errorType,
      message: errorMessage,
      details,
      timestamp: new Date().toISOString(),
    };

    this.emitToAll("error-event", eventData);
    return eventData;
  }

  // Notification Events
  emitNotification(
    notificationType,
    message,
    priority = "info",
    targetGroup = null
  ) {
    const eventData = {
      type: notificationType,
      message,
      priority,
      timestamp: new Date().toISOString(),
    };

    if (targetGroup) {
      this.emitToGroup(targetGroup, "notification", eventData);
    } else {
      this.emitToAll("notification", eventData);
    }

    return eventData;
  }

  // Data Update Events
  emitDataUpdate(dataType, data, targetGroup = null) {
    const eventData = {
      type: dataType,
      data,
      timestamp: new Date().toISOString(),
    };

    if (targetGroup) {
      this.emitToGroup(targetGroup, "data-update", eventData);
    } else {
      this.emitToAll("data-update", eventData);
    }

    return eventData;
  }

  // Job Status Events
  emitJobStatus(jobId, status, progress = null, details = {}) {
    const eventData = {
      jobId,
      status,
      progress,
      details,
      timestamp: new Date().toISOString(),
    };

    this.emitToGroup("production", "job-status", eventData);
    return eventData;
  }

  // Servo Status Events
  emitServoStatus(servoId, status, position = null, speed = null) {
    const eventData = {
      servoId,
      status,
      position,
      speed,
      timestamp: new Date().toISOString(),
    };

    this.emitToAll("servo-status", eventData);
    return eventData;
  }

  // Maintenance Events
  emitMaintenanceEvent(eventType, component, details = {}) {
    const eventData = {
      type: eventType,
      component,
      details,
      timestamp: new Date().toISOString(),
    };

    this.emitToGroup("maintenance", "maintenance-event", eventData);
    return eventData;
  }

  // Utility Methods

  getConnectedClientsCount() {
    return this.connectedClients.size;
  }

  getGroupMembersCount(groupName) {
    const group = this.clientGroups.get(groupName);
    return group ? group.size : 0;
  }

  getClientInfo(socketId) {
    const socket = this.connectedClients.get(socketId);
    return socket ? socket.clientInfo : null;
  }

  getGroupMembers(groupName) {
    const group = this.clientGroups.get(groupName);
    if (!group) return [];

    return Array.from(group).map((id) => ({
      socketId: id,
      clientInfo: this.getClientInfo(id),
    }));
  }

  // Health Check
  async healthCheck() {
    try {
      return {
        status: "healthy",
        message: "Event Emitter Service working",
        stats: {
          connectedClients: this.connectedClients.size,
          groups: this.clientGroups.size,
          isInitialized: this.isInitialized,
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error.message,
      };
    }
  }

  async shutdown() {
    try {
      logger.info("🔄 Shutting down Event Emitter Service...");

      // Clear all data structures
      this.connectedClients.clear();
      this.clientGroups.clear();
      this.isInitialized = false;

      logger.info("✅ Event Emitter Service shutdown complete");
    } catch (error) {
      logger.warn(
        "⚠️ Error during Event Emitter Service shutdown:",
        error.message
      );
    }
  }
}
