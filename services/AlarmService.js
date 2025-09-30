import { Server } from "socket.io";
import { readBit } from "./modbus.js";
import logger from "../logger.js";

class AlarmService {
  constructor(port = 3001) {
    this.port = port;
    this.io = null;
    this.isRunning = false;
    this.alarmInterval = null;
    this.lastAlarmStates = {
      partPresent: false,
      emergencyStop: false,
      safetySensor: false,
    };
  }

  async start() {
    try {
      // Create Socket.IO server
      this.io = new Server(this.port, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"],
        },
      });

      // Setup Socket.IO event handlers
      this.setupSocketHandlers();

      // Start alarm monitoring
      this.startAlarmMonitoring();

      logger.success(`🚨 Alarm Service started on port ${this.port}`);
      return true;
    } catch (error) {
      logger.error("❌ Failed to start Alarm Service:", error);
      return false;
    }
  }

  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      logger.info(`📡 Client connected to Alarm Service: ${socket.id}`);

      // Send current alarm status to new client
      socket.emit("alarm_status", {
        timestamp: new Date().toISOString(),
        status: "connected",
        alarms: this.lastAlarmStates,
      });

      socket.on("disconnect", () => {
        logger.info(`📡 Client disconnected from Alarm Service: ${socket.id}`);
      });

      socket.on("request_alarm_status", () => {
        socket.emit("alarm_status", {
          timestamp: new Date().toISOString(),
          status: "current",
          alarms: this.lastAlarmStates,
        });
      });
    });
  }

  startAlarmMonitoring() {
    if (this.isRunning) {
      logger.warn("⚠️ Alarm monitoring already running");
      return;
    }

    this.isRunning = true;
    logger.info("🔍 Starting continuous alarm monitoring...");

    this.alarmInterval = setInterval(async () => {
      try {
        await this.checkAlarms();
      } catch (error) {
        logger.error("❌ Error in alarm monitoring:", error);
      }
    }, 500); // Check every 500ms
  }

  async checkAlarms() {
    try {
      // Read safety bits from register 1490
      const [partPresent, emergencyStop, safetySensor] = await Promise.all([
        readBit(1490, 0), // Part not present. 1490.0
        readBit(1490, 1), // Emergency stop. 1490.1
        readBit(1490, 2), // Safety sensor. 1490.2
      ]);

      // Check for state changes
      const stateChanged =
        partPresent !== this.lastAlarmStates.partPresent ||
        emergencyStop !== this.lastAlarmStates.emergencyStop ||
        safetySensor !== this.lastAlarmStates.safetySensor;

      // Update last known states
      this.lastAlarmStates = {
        partPresent,
        emergencyStop,
        safetySensor,
      };

      // Log current state
      logger.info(
        `🔍 Alarm Check: partPresent=${partPresent}, emergencyStop=${emergencyStop}, safetySensor=${safetySensor}`
      );

      // Check for active alarms
      const activeAlarms = [];
      if (partPresent) activeAlarms.push("part_not_present");
      if (emergencyStop) activeAlarms.push("emergency_stop");
      if (safetySensor) activeAlarms.push("safety_sensor");

      // Emit alarm events if there are active alarms
      if (activeAlarms.length > 0) {
        this.emitAlarmEvents(activeAlarms, {
          partPresent,
          emergencyStop,
          safetySensor,
        });
      } else if (stateChanged) {
        // Emit clear event if alarms were cleared
        this.emitAlarmCleared();
      }
    } catch (error) {
      logger.error(`Error checking alarms: ${error.message}`);

      // Emit connection error
      if (this.io) {
        this.io.emit("alarm_error", {
          timestamp: new Date().toISOString(),
          error: "PLC connection failed",
          message: error.message,
        });
      }
    }
  }

  emitAlarmEvents(activeAlarms, alarmStates) {
    if (!this.io) return;

    // Emit individual alarm events
    activeAlarms.forEach((alarmType) => {
      const alarmData = this.getAlarmData(alarmType, alarmStates);

      logger.error(`🚨 ALARM: ${alarmData.violation}`);

      this.io.emit("safety_violation", alarmData);
      this.io.emit("alarm_triggered", {
        timestamp: new Date().toISOString(),
        alarmType: alarmType,
        severity: "critical",
        data: alarmData,
      });
    });

    // Emit combined alarm status
    this.io.emit("alarm_status", {
      timestamp: new Date().toISOString(),
      status: "alarm_active",
      activeAlarms: activeAlarms,
      alarms: alarmStates,
    });
  }

  emitAlarmCleared() {
    if (!this.io) return;

    logger.info("✅ All alarms cleared");

    this.io.emit("alarm_cleared", {
      timestamp: new Date().toISOString(),
      message: "All safety alarms cleared",
    });

    this.io.emit("alarm_status", {
      timestamp: new Date().toISOString(),
      status: "normal",
      activeAlarms: [],
      alarms: this.lastAlarmStates,
    });
  }

  getAlarmData(alarmType, alarmStates) {
    const alarmConfigs = {
      part_not_present: {
        violation: "Part not present",
        register: "1490.0",
        value: alarmStates.partPresent,
        severity: "critical",
        action: "stop_cycle",
      },
      emergency_stop: {
        violation: "Emergency stop activated",
        register: "1490.1",
        value: alarmStates.emergencyStop,
        severity: "critical",
        action: "immediate_stop",
      },
      safety_sensor: {
        violation: "Safety sensor not engaged",
        register: "1490.2",
        value: alarmStates.safetySensor,
        severity: "critical",
        action: "stop_cycle",
      },
    };

    const config = alarmConfigs[alarmType];
    return {
      timestamp: new Date().toISOString(),
      violation: config.violation,
      cycleNumber: 0, // Not applicable for independent service
      register: config.register,
      value: config.value,
      severity: config.severity,
      action: config.action,
      alarmType: alarmType,
    };
  }

  stop() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }

    this.isRunning = false;

    if (this.io) {
      this.io.close();
      this.io = null;
    }

    logger.info("🛑 Alarm Service stopped");
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      connectedClients: this.io ? this.io.engine.clientsCount : 0,
      lastAlarmStates: this.lastAlarmStates,
    };
  }
}

export default AlarmService;
