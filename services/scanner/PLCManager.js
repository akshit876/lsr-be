import * as modbusService from '../modbus.js';
import logger from '../../logger.js';
import { REGISTERS } from './constants.js';

export class PLCManager {
  constructor() {
    this.connected = false;
  }

  async initialize() {
    await this.connect();
  }

  async connect() {
    try {
      await modbusService.connect();
      this.connected = true;
      logger.success("PLC connection established");
    } catch (error) {
      this.connected = false;
      throw new Error("PLC connection failed");
    }
  }

  async writeBit(register, bit, value) {
    try {
      await modbusService.writeBit(register, bit, value);
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async readBit(register, bit) {
    try {
      return await modbusService.readBit(register, bit);
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async resetBits() {
    try {
      logger.info("🔄 Resetting bits...");

      await Promise.all([
        this.resetSpecificBits(1414, [3, 4, 6, 7]),
        this.resetSpecificBits(1415, [4]),
      ]);

      await new Promise(resolve => setTimeout(resolve, 500));
      logger.success("Bits reset successfully");
    } catch (error) {
      logger.error("Error in resetBits:", error);
      throw error;
    }
  }

  async resetSpecificBits(register, bitsToReset) {
    try {
      const [currentValue] = await modbusService.readRegister(register, 1);
      const mask = bitsToReset.reduce((mask, bit) => mask & ~(1 << bit), 0xffff);
      const newValue = currentValue & mask;

      await modbusService.writeRegister(register, newValue);
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      logger.error(`Error resetting bits in register ${register}:`, error);
      throw error;
    }
  }

  async signalFileTransfer() {
    try {
      logger.info("✍️ Writing bit 1414.15(F) to signal file transfer");
      await this.writeBit(REGISTERS.FILE_TRANSFER.register, REGISTERS.FILE_TRANSFER.bit, 1);
    } catch (error) {
      logger.error("Error signaling file transfer:", error);
      throw error;
    }
  }

  private async handleError(error) {
    this.connected = false;
    logger.error("PLC communication error:", error);
    throw error;
  }
} 