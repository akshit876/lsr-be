import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";

export class SocketEventService {
  constructor(modbusService) {
    this.modbusService = modbusService;
    this.isInitialized = false;
    this.eventCounts = {
      scanner_trigger: 0,
      mark_on: 0,
      light_on: 0,
      manual_run: 0,
      servo_setting_change: 0,
      job_control: 0,
      plc_bit_operation: 0,
      plc_register_operation: 0,
    };
  }

  async initialize() {
    try {
      logger.info("🚀 Initializing Socket Event Service...");

      // Add a small delay to ensure other services are ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      this.isInitialized = true;
      logger.success("✅ Socket Event Service initialized successfully");
    } catch (error) {
      logger.error("❌ Socket Event Service initialization failed:", error);
      throw error;
    }
  }

  setupEventHandlers(socket) {
    // Scanner Trigger Event
    socket.on("scanner_trigger", async () => {
      try {
        await this.handleScannerTrigger(socket);
        this.eventCounts.scanner_trigger++;
      } catch (error) {
        logger.error("Error in scanner_trigger handler:", error);
        this.emitError(socket, "scanner_trigger_failed", error.message);
      }
    });

    // Mark On Event
    socket.on("mark_on", async () => {
      try {
        await this.handleMarkOn(socket);
        this.eventCounts.mark_on++;
      } catch (error) {
        logger.error("Error in mark_on handler:", error);
        this.emitError(socket, "mark_on_failed", error.message);
      }
    });

    // Light On Event
    socket.on("light_on", async () => {
      try {
        await this.handleLightOn(socket);
        this.eventCounts.light_on++;
      } catch (error) {
        logger.error("Error in light_on handler:", error);
        this.emitError(socket, "light_on_failed", error.message);
      }
    });

    // Manual Run Event
    socket.on("manual-run", async (operation) => {
      try {
        await this.handleManualRun(socket, operation);
        this.eventCounts.manual_run++;
      } catch (error) {
        logger.error("Error in manual-run handler:", error);
        this.emitError(socket, "manual_run_failed", error.message);
      }
    });

    // Servo Setting Change Event
    socket.on("servo-setting-change", async (data) => {
      try {
        await this.handleServoSettingChange(socket, data);
        this.eventCounts.servo_setting_change++;
      } catch (error) {
        logger.error("Error in servo-setting-change handler:", error);
        this.emitError(socket, "servo_setting_change_failed", error.message);
      }
    });

    // Job Control Events
    socket.on("job-control", async ({ jobType, action }) => {
      try {
        await this.handleJobControl(socket, jobType, action);
        this.eventCounts.job_control++;
      } catch (error) {
        logger.error("Error in job-control handler:", error);
        this.emitError(socket, "job_control_failed", error.message);
      }
    });

    // Generic PLC Bit Operations
    socket.on("plc-bit-operation", async (data) => {
      try {
        await this.handlePlcBitOperation(socket, data);
        this.eventCounts.plc_bit_operation++;
      } catch (error) {
        logger.error("Error in plc-bit-operation handler:", error);
        this.emitError(socket, "plc_bit_operation_failed", error.message);
      }
    });

    // Generic PLC Register Operations
    socket.on("plc-register-operation", async (data) => {
      try {
        await this.handlePlcRegisterOperation(socket, data);
        this.eventCounts.plc_register_operation++;
      } catch (error) {
        logger.error("Error in plc-register-operation handler:", error);
        this.emitError(socket, "plc_register_operation_failed", error.message);
      }
    });

    // Service Status
    socket.on("get-event-service-status", () => {
      try {
        const status = this.getStatus();
        socket.emit("event-service-status", status);
      } catch (error) {
        logger.error("Error getting service status:", error);
        this.emitError(socket, "status_check_failed", error.message);
      }
    });

    // Health Check
    socket.on("health-check", async () => {
      try {
        const health = await this.healthCheck();
        socket.emit("health-check-response", health);
      } catch (error) {
        logger.error("Error during health check:", error);
        this.emitError(socket, "health_check_failed", error.message);
      }
    });
  }

  // Event Handler Methods
  async handleScannerTrigger(socket) {
    if (!this.isInitialized) {
      throw new Error("Socket Event Service not yet initialized");
    }

    logger.info(`🔍 Scanner trigger event received from client ${socket.id}`);

    const { address, bit } = config.plc.registers.scannerTrigger;
    await this.modbusService.writeBit(address, bit, 1);
    logger.info(`✅ Scanner trigger bit ${address}.${bit} set to 1`);

    // Emit success response
    socket.emit("scanner_trigger_success", {
      timestamp: new Date().toISOString(),
      register: address,
      bit: bit,
      value: 1,
    });

    return { success: true, register: address, bit: bit, value: 1 };
  }

  async handleMarkOn(socket) {
    if (!this.isInitialized) {
      throw new Error("Socket Event Service not yet initialized");
    }

    logger.info(`🎯 Mark on event received from client ${socket.id}`);

    const { address, bit } = config.plc.registers.markOn;
    await this.modbusService.writeBit(address, bit, 1);
    logger.info(`✅ Mark on bit ${address}.${bit} set to 1`);

    // Emit success response
    socket.emit("mark_on_success", {
      timestamp: new Date().toISOString(),
      register: address,
      bit: bit,
      value: 1,
    });

    return { success: true, register: address, bit: bit, value: 1 };
  }

  async handleLightOn(socket) {
    if (!this.isInitialized) {
      throw new Error("Socket Event Service not yet initialized");
    }

    logger.info(`💡 Light on event received from client ${socket.id}`);

    const { address, bit } = config.plc.registers.lightOn;
    await this.modbusService.writeBit(address, bit, 1);
    logger.info(`✅ Light on bit ${address}.${bit} set to 1`);

    // Emit success response
    socket.emit("light_on_success", {
      timestamp: new Date().toISOString(),
      register: address,
      bit: bit,
      value: 1,
    });

    return { success: true, register: address, bit: bit, value: 1 };
  }

  async handleManualRun(socket, operation) {
    if (!this.isInitialized) {
      throw new Error("Socket Event Service not yet initialized");
    }

    logger.info(
      `🔧 Manual run event received: ${operation} from client ${socket.id}`
    );

    // For now, just acknowledge the operation
    // This can be expanded to include actual PLC operations
    const result = {
      success: true,
      operation,
      timestamp: new Date().toISOString(),
      message: `Manual run operation ${operation} acknowledged`,
    };

    // Emit success response
    socket.emit("manualRunSuccess", result);
    logger.info(`✅ Manual run operation ${operation} completed successfully`);

    return result;
  }

  async handleServoSettingChange(socket, data) {
    if (!this.isInitialized) {
      throw new Error("Socket Event Service not yet initialized");
    }

    const { setting, value } = data;
    logger.info(
      `⚙️ Servo setting change event received: ${setting} from client ${socket.id}`
    );

    let register;
    let intValue;

    // Convert float values to integers for PLC
    const floatToInt = (value, isSpeed = false) => {
      if (isSpeed) {
        return Math.round(parseFloat(value));
      } else {
        return Math.round(parseFloat(value) * 100);
      }
    };

    // Map settings to registers
    const servoConfig = config.plc.registers.servo[setting];
    if (!servoConfig) {
      throw new Error(`Invalid setting: ${setting}`);
    }

    if (value.position !== undefined) {
      register = servoConfig.address;
      intValue = floatToInt(value.position);
    } else if (value.speed !== undefined && servoConfig.speedAddress) {
      register = servoConfig.speedAddress;
      intValue = floatToInt(value.speed, true);
    } else {
      throw new Error(`Invalid value format for setting: ${setting}`);
    }

    // Write to PLC register
    await this.modbusService.writeRegister(register, intValue);
    logger.info(
      `✅ Servo setting ${setting} updated to ${JSON.stringify(value)} (written as ${intValue})`
    );

    // Emit success response
    socket.emit("servo-setting-change-response", {
      success: true,
      setting,
    });

    return { success: true, setting, register, value: intValue };
  }

  async handleJobControl(socket, jobType, action) {
    logger.info(
      `📋 Job control event received: ${jobType} - ${action} from client ${socket.id}`
    );

    // This can be expanded for different job control operations
    const result = {
      success: true,
      jobType,
      action,
      timestamp: new Date().toISOString(),
      message: `Job control ${action} for ${jobType} acknowledged`,
    };

    socket.emit("jobControlSuccess", result);
    logger.info(
      `✅ Job control ${action} for ${jobType} completed successfully`
    );

    return result;
  }

  async handlePlcBitOperation(socket, { address, bit, value, operation }) {
    if (!this.isInitialized) {
      throw new Error("Socket Event Service not yet initialized");
    }

    logger.info(
      `🔌 PLC bit operation: ${operation} - address: ${address}, bit: ${bit}, value: ${value} from client ${socket.id}`
    );

    // Write bit to PLC
    await this.modbusService.writeBit(address, bit, value);
    logger.info(`✅ PLC bit operation successful: ${operation}`);

    // Emit success response
    socket.emit("plcBitOperationSuccess", {
      operation,
      address,
      bit,
      value,
      timestamp: new Date().toISOString(),
    });

    return { success: true, address, bit, value, operation };
  }

  async handlePlcRegisterOperation(socket, { address, value, operation }) {
    if (!this.isInitialized) {
      throw new Error("Socket Event Service not yet initialized");
    }

    logger.info(
      `🔌 PLC register operation: ${operation} - address: ${address}, value: ${value} from client ${socket.id}`
    );

    // Write register to PLC
    await this.modbusService.writeRegister(address, value);
    logger.info(`✅ PLC register operation successful: ${operation}`);

    // Emit success response
    socket.emit("plcRegisterOperationSuccess", {
      operation,
      address,
      value,
      timestamp: new Date().toISOString(),
    });

    return { success: true, address, value, operation };
  }

  // Utility Methods
  emitError(socket, errorType, errorMessage) {
    socket.emit("error", {
      type: errorType,
      message: errorMessage,
      timestamp: new Date().toISOString(),
    });
    logger.error(`${errorType}: ${errorMessage}`);
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      eventCounts: this.eventCounts,
      timestamp: new Date().toISOString(),
      serviceHealth: "healthy",
    };
  }

  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return { status: "unhealthy", message: "Service not initialized" };
      }

      // Check Modbus service health
      const modbusHealth = await this.modbusService.healthCheck();
      if (modbusHealth.status === "unhealthy") {
        return {
          status: "unhealthy",
          message: `Modbus service: ${modbusHealth.message}`,
        };
      }

      return { status: "healthy", message: "All services working" };
    } catch (error) {
      return { status: "unhealthy", message: error.message };
    }
  }

  async shutdown() {
    try {
      logger.info("🔄 Shutting down Socket Event Service...");
      this.isInitialized = false;
      logger.info("✅ Socket Event Service shutdown complete");
    } catch (error) {
      logger.warn(
        "⚠️ Error during Socket Event Service shutdown:",
        error.message
      );
    }
  }
}
