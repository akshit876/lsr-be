import { Server } from "socket.io";
import ModbusRTU from "modbus-serial";
import logger from "../logger.js";
import process from "process";

class IndependentAlarmService {
  constructor(port = 3005, plcConfig = {}) {
    this.port = port;
    this.io = null;
    this.isRunning = false;
    this.alarmInterval = null;
    this.modbusClient = null;
    this.lastAlarmStates = {
      partPresent: false,
      emergencyStop: false,
      safetySensor: false,
    };

    // PLC Configuration - completely independent
    this.plcConfig = {
      host: plcConfig.host || process.env.MODBUS_IP || "192.168.3.146",
      port: plcConfig.port || parseInt(process.env.MODBUS_PORT) || 502,
      timeout: 5000,
      ...plcConfig,
    };
  }

  async start() {
    try {
      // Create Socket.IO server with fixed CORS configuration
      this.io = new Server(this.port, {
        cors: {
          origin: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
          ],
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
          allowedHeaders: [
            "Content-Type",
            "Authorization",
            "my-custom-header",
            "x-custom-header",
            "Accept",
            "Origin",
            "X-Requested-With",
          ],
          credentials: true,
        },
        allowEIO3: true,
        transports: ["websocket", "polling"],
      });

      // Setup Socket.IO event service port

      this.setupSocketHandlers();

      // Initialize independent Modbus connection
      await this.initializeModbusConnection();

      // Start alarm monitoring
      this.startAlarmMonitoring();

      logger.success(
        `🚨 Independent Alarm Service started on port ${this.port}`
      );
      logger.info(`📡 PLC: ${this.plcConfig.host}:${this.plcConfig.port}`);
      return true;
    } catch (error) {
      logger.error("❌ Failed to start Independent Alarm Service:", error);
      return false;
    }
  }

  async initializeModbusConnection() {
    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Close existing connection if any
        if (this.modbusClient) {
          try {
            this.modbusClient.close();
          } catch (closeError) {
            // Ignore close errors
          }
        }

        this.modbusClient = new ModbusRTU();

        // Connect to PLC with timeout protection
        await Promise.race([
          this.modbusClient.connectTCP(this.plcConfig.host, {
            port: this.plcConfig.port,
            timeout: this.plcConfig.timeout,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Connection timeout")), 5000)
          ),
        ]);

        this.modbusClient.setTimeout(this.plcConfig.timeout);

        logger.success(
          `✅ Independent Modbus connection established: ${this.plcConfig.host}:${this.plcConfig.port} (attempt ${attempt})`
        );
        return; // Success
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === maxAttempts;

        logger.warn(
          `⚠️ Independent connection attempt ${attempt}/${maxAttempts} failed: ${error.message}`
        );

        if (!isLastAttempt) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
          logger.info(`⏳ Retrying independent connection in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(
      `❌ Failed to establish independent Modbus connection after ${maxAttempts} attempts:`,
      lastError
    );
    throw lastError;
  }

  async readBit(register, bit) {
    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check connection health
        if (!this.modbusClient || !this.modbusClient.isOpen) {
          logger.warn(
            `🔄 Independent service reconnecting (attempt ${attempt}/${maxAttempts})...`
          );
          await this.initializeModbusConnection();
        }

        // Add timeout protection for the read operation
        const result = await Promise.race([
          this.modbusClient.readHoldingRegisters(register, 1),
          new Promise(
            (_, reject) =>
              setTimeout(() => reject(new Error("Read timeout")), 500) // Reduced to 500ms
          ),
        ]);

        const value = result.data[0];
        const bitValue = (value >> bit) & 1;

        if (attempt > 1) {
          logger.info(
            `✅ Independent service bit read recovered on attempt ${attempt}`
          );
        }

        return bitValue === 1;
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === maxAttempts;

        if (
          error.message.includes("timeout") ||
          error.message.includes("Port Not Open")
        ) {
          logger.warn(
            `⚠️ Independent service bit read attempt ${attempt}/${maxAttempts} failed for ${register}.${bit}: ${error.message}`
          );

          // Force reconnection on connection errors
          if (error.message.includes("Port Not Open")) {
            try {
              if (this.modbusClient) {
                this.modbusClient.close();
              }
            } catch (closeError) {
              // Ignore close errors
            }
            this.modbusClient = null;
          }

          if (!isLastAttempt) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000); // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        if (isLastAttempt) {
          logger.error(
            `❌ Independent service failed to read bit ${register}.${bit} after ${maxAttempts} attempts: ${error.message}`
          );
        }
      }
    }

    return false; // Default to false on complete failure
  }

  async readSafetyBits() {
    const maxAttempts = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check connection health
        if (!this.modbusClient || !this.modbusClient.isOpen) {
          logger.warn(
            `🔄 Independent service reconnecting for safety bits (attempt ${attempt}/${maxAttempts})...`
          );
          await this.initializeModbusConnection();
        }

        // Read all 3 bits from register 1490 in a single call
        const result = await Promise.race([
          this.modbusClient.readHoldingRegisters(1490, 1),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Safety bits read timeout")), 500)
          ),
        ]);

        const value = result.data[0];

        // Extract all 3 bits from the single register
        const partPresent = (value >> 0) & 1; // Bit 0
        const emergencyStop = (value >> 1) & 1; // Bit 1
        const safetySensor = (value >> 2) & 1; // Bit 2

        if (attempt > 1) {
          logger.info(
            `✅ Independent service safety bits read recovered on attempt ${attempt}`
          );
        }

        return [partPresent === 1, emergencyStop === 1, safetySensor === 1];
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === maxAttempts;

        if (
          error.message.includes("timeout") ||
          error.message.includes("Port Not Open")
        ) {
          logger.warn(
            `⚠️ Independent service safety bits read attempt ${attempt}/${maxAttempts} failed: ${error.message}`
          );

          // Force reconnection on connection errors
          if (error.message.includes("Port Not Open")) {
            try {
              if (this.modbusClient) {
                this.modbusClient.close();
              }
            } catch (closeError) {
              // Ignore close errors
            }
            this.modbusClient = null;
          }

          if (!isLastAttempt) {
            const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000); // Faster retry
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        if (isLastAttempt) {
          logger.error(
            `❌ Independent service failed to read safety bits after ${maxAttempts} attempts: ${error.message}`
          );
        }
      }
    }

    // Return default values on complete failure
    return [false, false, false];
  }

  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      logger.info(
        `📡 Client connected to Independent Alarm Service: ${socket.id}`
      );

      // Send current alarm status to new client
      socket.emit("alarm_status", {
        timestamp: new Date().toISOString(),
        status: "connected",
        alarms: this.lastAlarmStates,
        service: "independent",
      });

      socket.on("disconnect", () => {
        logger.info(
          `📡 Client disconnected from Independent Alarm Service: ${socket.id}`
        );
      });

      socket.on("request_alarm_status", () => {
        socket.emit("alarm_status", {
          timestamp: new Date().toISOString(),
          status: "current",
          alarms: this.lastAlarmStates,
          service: "independent",
        });
      });

      socket.on("request_plc_status", async () => {
        try {
          const isConnected = this.modbusClient && this.modbusClient.isOpen;
          socket.emit("plc_status", {
            timestamp: new Date().toISOString(),
            connected: isConnected,
            host: this.plcConfig.host,
            port: this.plcConfig.port,
          });
        } catch (error) {
          socket.emit("plc_status", {
            timestamp: new Date().toISOString(),
            connected: false,
            error: error.message,
          });
        }
      });
    });
  }

  startAlarmMonitoring() {
    if (this.isRunning) {
      logger.warn("⚠️ Alarm monitoring already running");
      return;
    }

    this.isRunning = true;
    logger.info("🔍 Starting independent alarm monitoring...");

    this.alarmInterval = setInterval(async () => {
      try {
        await this.checkAlarms();
      } catch (error) {
        logger.error("❌ Error in alarm monitoring:", error);
      }
    }, 100); // Check every 100ms for faster response
  }

  async checkAlarms() {
    try {
      // Read all safety bits from register 1490 in a single call for faster response
      const safetyBits = await this.readSafetyBits();
      const partPresent = safetyBits[0]; // 1490.0
      const emergencyStop = safetyBits[1]; // 1490.1
      const safetySensor = safetyBits[2]; // 1490.2

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

      // Check for active alarms
      const activeAlarms = [];
      if (partPresent) {
        // 1490.0 = 1 means "Part not present" - ALARM!
        activeAlarms.push("part_not_present");
      }
      if (emergencyStop) {
        // 1490.1 = 1 means "Emergency stop" - ALARM!
        activeAlarms.push("emergency_stop");
      }
      if (safetySensor) {
        // 1490.2 = 1 means "Safety sensor not engaged" - ALARM!
        activeAlarms.push("safety_sensor");
      }

      // Log current state only if there are alarms or state changed
      if (activeAlarms.length > 0 || stateChanged) {
        logger.info(
          `🔍 Independent Alarm Check: partPresent=${partPresent}, emergencyStop=${emergencyStop}, safetySensor=${safetySensor}`
        );
      }

      // Only emit events if there are active alarms
      if (activeAlarms.length > 0) {
        this.emitAlarmEvents(activeAlarms, {
          partPresent,
          emergencyStop,
          safetySensor,
        });
      }
    } catch (error) {
      logger.error(`Error checking alarms: ${error.message}`);

      // Emit connection error
      if (this.io) {
        this.io.emit("alarm_error", {
          timestamp: new Date().toISOString(),
          error: "PLC connection failed",
          message: error.message,
          service: "independent",
        });
      }
    }
  }

  emitAlarmEvents(activeAlarms, alarmStates) {
    if (!this.io) {
      return;
    }

    // Emit individual safety violation events
    activeAlarms.forEach((alarmType) => {
      const alarmData = this.getAlarmData(alarmType, alarmStates);

      logger.error(`🚨 INDEPENDENT ALARM: ${alarmData.violation}`);

      // Only emit safety_violation event - no other events
      this.io.emit("safety_violation", alarmData);
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
      service: "independent",
    };
  }

  stop() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }

    this.isRunning = false;

    if (this.modbusClient) {
      this.modbusClient.close();
      this.modbusClient = null;
    }

    if (this.io) {
      this.io.close();
      this.io = null;
    }

    logger.info("🛑 Independent Alarm Service stopped");
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      connectedClients: this.io ? this.io.engine.clientsCount : 0,
      lastAlarmStates: this.lastAlarmStates,
      plcConnected: this.modbusClient ? this.modbusClient.isOpen : false,
      plcConfig: this.plcConfig,
      service: "independent",
    };
  }
}

export default IndependentAlarmService;
