import { writeBit, writeRegister } from "./modbus.js";
import { manualRun } from "./manualRunService.js";
import logger from "../logger.js";

class SocketEventService {
  constructor() {
    this.isInitialized = false;
    this.eventQueue = [];
    this.processing = false;
  }

  async initialize() {
    if (this.isInitialized) {
      logger.warn("SocketEventService already initialized");
      return;
    }

    logger.info(
      "🚀 Initializing SocketEventService for parallel event handling"
    );

    // Add a small delay to ensure other services are ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.isInitialized = true;
    logger.success("SocketEventService initialized successfully");
  }

  // Handle manual run operations
  async handleManualRun(socket, operation) {
    try {
      logger.info(
        `🔧 Manual run event received: ${operation} from client ${socket.id}`
      );

      // Check if service is ready
      if (!this.isInitialized) {
        throw new Error("SocketEventService not yet initialized");
      }

      // Execute manual run operation
      const result = await manualRun(operation, socket);

      // Emit success response
      socket.emit("manualRunSuccess", { operation, result });
      logger.info(
        `✅ Manual run operation ${operation} completed successfully`
      );

      return result;
    } catch (error) {
      logger.error(`❌ Manual run operation ${operation} failed:`, error);
      socket.emit("error", {
        message: "Failed to execute manual run",
        details: error.message,
      });
      throw error;
    }
  }

  // Handle scanner trigger
  async handleScannerTrigger(socket) {
    try {
      logger.info(`🔍 Scanner trigger event received from client ${socket.id}`);

      // Check if service is ready
      if (!this.isInitialized) {
        throw new Error("SocketEventService not yet initialized");
      }

      // Set scanner trigger bit (1481.0)
      await writeBit(1481, 0, 1);
      logger.info("✅ Scanner trigger bit 1481.0 set to 1");

      // Emit success response
      socket.emit("scanner_trigger_success", {
        timestamp: new Date().toISOString(),
        register: 1481,
        bit: 0,
        value: 1,
      });

      return { success: true, register: 1481, bit: 0, value: 1 };
    } catch (error) {
      logger.error(`❌ Scanner trigger failed for client ${socket.id}:`, error);
      socket.emit("error", {
        message: "Failed to trigger scanner",
        details: error.message,
      });
      throw error;
    }
  }

  // Handle mark on
  async handleMarkOn(socket) {
    try {
      logger.info(`🎯 Mark on event received from client ${socket.id}`);

      // Check if service is ready
      if (!this.isInitialized) {
        throw new Error("SocketEventService not yet initialized");
      }

      // Set mark on bit (1480.0)
      await writeBit(1480, 0, 1);
      logger.info("✅ Mark on bit 1480.0 set to 1");

      // Emit success response
      socket.emit("mark_on_success", {
        timestamp: new Date().toISOString(),
        register: 1480,
        bit: 0,
        value: 1,
      });

      return { success: true, register: 1480, bit: 0, value: 1 };
    } catch (error) {
      logger.error(`❌ Mark on failed for client ${socket.id}:`, error);
      socket.emit("error", {
        message: "Failed to trigger mark on",
        details: error.message,
      });
      throw error;
    }
  }

  // Handle light on
  async handleLightOn(socket) {
    try {
      logger.info(`💡 Light on event received from client ${socket.id}`);

      // Check if service is ready
      if (!this.isInitialized) {
        throw new Error("SocketEventService not yet initialized");
      }

      // Set light on bit (1482.0)
      await writeBit(1482, 0, 1);
      logger.info("✅ Light on bit 1482.0 set to 1");

      // Emit success response
      socket.emit("light_on_success", {
        timestamp: new Date().toISOString(),
        register: 1482,
        bit: 0,
        value: 1,
      });

      return { success: true, register: 1482, bit: 0, value: 1 };
    } catch (error) {
      logger.error(`❌ Light on failed for client ${socket.id}:`, error);
      socket.emit("error", {
        message: "Failed to trigger light on",
        details: error.message,
      });
      throw error;
    }
  }

  // Handle servo setting changes
  async handleServoSettingChange(socket, data) {
    try {
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
      switch (setting) {
        case "homePosition":
          if (value.position !== undefined) {
            register = 550;
            intValue = floatToInt(value.position);
          } else {
            register = 560;
            intValue = floatToInt(value.speed, true);
          }
          break;
        case "scannerPosition":
          if (value.position !== undefined) {
            register = 552;
            intValue = floatToInt(value.position);
          } else {
            register = 562;
            intValue = floatToInt(value.speed, true);
          }
          break;
        case "ocrPosition":
          if (value.position !== undefined) {
            register = 554;
            intValue = floatToInt(value.position);
          } else {
            register = 564;
            intValue = floatToInt(value.speed, true);
          }
          break;
        case "markPosition":
          if (value.position !== undefined) {
            register = 556;
            intValue = floatToInt(value.position);
          } else {
            register = 566;
            intValue = floatToInt(value.speed, true);
          }
          break;
        case "fwdEndLimit":
          register = 574;
          intValue = floatToInt(value.position);
          break;
        case "revEndLimit":
          register = 578;
          intValue = floatToInt(value.position);
          break;
        default:
          throw new Error("Invalid setting");
      }

      // Write to PLC register
      await writeRegister(register, intValue);
      logger.info(
        `✅ Servo setting ${setting} updated to ${JSON.stringify(value)} (written as ${intValue})`
      );

      // Emit success response
      socket.emit("servo-setting-change-response", {
        success: true,
        setting,
      });

      return { success: true, setting, register, value: intValue };
    } catch (error) {
      logger.error(
        `❌ Servo setting change failed for client ${socket.id}:`,
        error
      );
      socket.emit("servo-setting-change-response", {
        success: false,
        setting: data.setting,
        message: error.message,
      });
      throw error;
    }
  }

  // Handle job control events (for future expansion)
  async handleJobControl(socket, jobType, action) {
    try {
      logger.info(
        `📋 Job control event received: ${jobType} - ${action} from client ${socket.id}`
      );

      // This can be expanded for different job control operations
      // For now, just acknowledge the event
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
    } catch (error) {
      logger.error(`❌ Job control failed for client ${socket.id}:`, error);
      socket.emit("error", {
        message: "Failed to execute job control",
        details: error.message,
      });
      throw error;
    }
  }

  // Generic event handler for any PLC bit operations
  async handlePlcBitOperation(socket, { address, bit, value, operation }) {
    try {
      logger.info(
        `🔌 PLC bit operation: ${operation} - address: ${address}, bit: ${bit}, value: ${value} from client ${socket.id}`
      );

      // Write bit to PLC
      await writeBit(address, bit, value);
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
    } catch (error) {
      logger.error(
        `❌ PLC bit operation failed for client ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Failed to execute PLC bit operation",
        details: error.message,
      });
      throw error;
    }
  }

  // Generic event handler for any PLC register operations
  async handlePlcRegisterOperation(socket, { address, value, operation }) {
    try {
      logger.info(
        `🔌 PLC register operation: ${operation} - address: ${address}, value: ${value} from client ${socket.id}`
      );

      // Write register to PLC
      await writeRegister(address, value);
      logger.info(`✅ PLC register operation successful: ${operation}`);

      // Emit success response
      socket.emit("plcRegisterOperationSuccess", {
        operation,
        address,
        value,
        timestamp: new Date().toISOString(),
      });

      return { success: true, address, value, operation };
    } catch (error) {
      logger.error(
        `❌ PLC register operation failed for client ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Failed to execute PLC register operation",
        details: error.message,
      });
      throw error;
    }
  }

  // Get service status
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isProcessing: this.processing,
      queueLength: this.eventQueue.length,
      timestamp: new Date().toISOString(),
      serviceHealth: "healthy",
    };
  }

  // Check if service is ready to handle events
  isReady() {
    return this.isInitialized;
  }

  // Health check method
  async healthCheck() {
    try {
      // Try to read a simple register to test Modbus connection
      const { readRegister } = await import("./modbus.js");
      await readRegister(1, 1);
      return { status: "healthy", message: "All connections working" };
    } catch (error) {
      return { status: "unhealthy", message: error.message };
    }
  }
}

// Export singleton instance
const socketEventService = new SocketEventService();
export default socketEventService;
