import ModbusRTU from "modbus-serial";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";

export class ModbusService {
  constructor() {
    this.client = new ModbusRTU();
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = config.modbus.retries;
  }

  async initialize() {
    try {
      logger.info(
        `🔌 Connecting to Modbus at ${config.modbus.ip}:${config.modbus.port}...`
      );

      await this.connect();

      // Set up connection monitoring
      this.setupConnectionMonitoring();

      logger.success("✅ Modbus service initialized successfully");
    } catch (error) {
      logger.error("❌ Modbus service initialization failed:", error);
      throw error;
    }
  }

  async connect() {
    try {
      await this.client.connectTCP(config.modbus.ip, {
        port: config.modbus.port,
        timeout: config.modbus.timeout,
      });

      this.isConnected = true;
      this.connectionRetries = 0;
      logger.success(
        `✅ Connected to Modbus at ${config.modbus.ip}:${config.modbus.port}`
      );
    } catch (error) {
      this.isConnected = false;
      logger.error(`❌ Failed to connect to Modbus: ${error.message}`);
      throw error;
    }
  }

  async reconnect() {
    if (this.connectionRetries >= this.maxRetries) {
      throw new Error(`Max reconnection attempts (${this.maxRetries}) reached`);
    }

    this.connectionRetries++;
    logger.warn(
      `🔄 Attempting to reconnect to Modbus (attempt ${this.connectionRetries}/${this.maxRetries})...`
    );

    try {
      await this.connect();
    } catch (error) {
      logger.error(
        `❌ Reconnection attempt ${this.connectionRetries} failed:`,
        error.message
      );
      throw error;
    }
  }

  setupConnectionMonitoring() {
    // Monitor connection health
    setInterval(async () => {
      if (!this.isConnected) {
        logger.warn("⚠️ Modbus connection lost, attempting to reconnect...");
        try {
          await this.reconnect();
        } catch (error) {
          logger.error("❌ Failed to reconnect to Modbus:", error.message);
        }
      }
    }, config.health.checkInterval);
  }

  async writeBit(address, bit, value) {
    if (!this.isConnected) {
      throw new Error("Modbus not connected");
    }

    try {
      await this.client.writeCoil(address * 1000 + bit, value);
      logger.debug(
        `✅ Wrote bit ${bit} at address ${address} with value ${value}`
      );
      return true;
    } catch (error) {
      logger.error(
        `❌ Failed to write bit ${bit} at address ${address}:`,
        error.message
      );
      throw error;
    }
  }

  async readBit(address, bit) {
    if (!this.isConnected) {
      throw new Error("Modbus not connected");
    }

    try {
      const result = await this.client.readCoils(address * 1000 + bit, 1);
      const value = result.data[0];
      logger.debug(`✅ Read bit ${bit} at address ${address}: ${value}`);
      return value;
    } catch (error) {
      logger.error(
        `❌ Failed to read bit ${bit} at address ${address}:`,
        error.message
      );
      throw error;
    }
  }

  async writeRegister(address, value) {
    if (!this.isConnected) {
      throw new Error("Modbus not connected");
    }

    try {
      await this.client.writeRegister(address, value);
      logger.debug(`✅ Wrote register ${address} with value ${value}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to write register ${address}:`, error.message);
      throw error;
    }
  }

  async readRegister(address, count = 1) {
    if (!this.isConnected) {
      throw new Error("Modbus not connected");
    }

    try {
      const result = await this.client.readHoldingRegisters(address, count);
      const values = result.data;
      logger.debug(
        `✅ Read ${count} registers starting at ${address}: ${JSON.stringify(values)}`
      );
      return values;
    } catch (error) {
      logger.error(
        `❌ Failed to read registers starting at ${address}:`,
        error.message
      );
      throw error;
    }
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: "unhealthy", message: "Modbus not connected" };
      }

      // Try to read a simple register to test connection
      await this.readRegister(1, 1);
      return { status: "healthy", message: "Modbus connection working" };
    } catch (error) {
      return { status: "unhealthy", message: error.message };
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      ip: config.modbus.ip,
      port: config.modbus.port,
      connectionRetries: this.connectionRetries,
      maxRetries: this.maxRetries,
      timestamp: new Date().toISOString(),
    };
  }

  async shutdown() {
    try {
      if (this.client && this.isConnected) {
        this.client.close();
        this.isConnected = false;
        logger.info("✅ Modbus connection closed");
      }
    } catch (error) {
      logger.warn("⚠️ Error during Modbus shutdown:", error.message);
    }
  }
}
