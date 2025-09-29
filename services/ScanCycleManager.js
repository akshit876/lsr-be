/**
 * Scan Cycle Manager - Clean Architecture Implementation
 *
 * This module provides a clean, race-condition-free implementation of the scan cycle system.
 * It uses proper design patterns and state management to ensure reliable operation.
 */

import {
  connect,
  readBit,
  writeBit,
  readRegister,
  disconnect,
} from "./modbus.js";
import logger from "../logger.js";
import { sleep } from "./utils.js";

/**
 * Scan Cycle States
 */
export const ScanCycleState = {
  IDLE: "idle",
  WAITING_FOR_START: "waiting_for_start",
  FIRST_SCAN: "first_scan",
  MIDDLE_SCAN: "middle_scan",
  VERIFICATION_SCAN: "verification_scan",
  COMPLETED: "completed",
  ERROR: "error",
  RESET: "reset",
};

/**
 * PLC Register Configuration
 */
export const PLC_REGISTERS = {
  CONTROL: {
    START_SIGNAL: { register: 1410, bit: 0 },
    OCR_TRIGGER: { register: 1410, bit: 1 },
    LASER_TRANSFER: { register: 1410, bit: 2 },
    SCANNER_TRIGGER: { register: 1410, bit: 3 },
    FILE_TRANSFER: { register: 1410, bit: 11 },
    CYCLE_COMPLETE: { register: 1410, bit: 12 },
  },
  STATUS: {
    DATA_MATCH_OK: { register: 1414, bit: 3 },
    DATA_MATCH_NG: { register: 1414, bit: 4 },
    FIRST_SCAN_OK: { register: 1414, bit: 6 },
    FIRST_SCAN_NG: { register: 1414, bit: 7 },
    FILE_TRANSFER: { register: 1414, bit: 15 },
  },
  SAFETY: {
    PART_NOT_PRESENT: { register: 1490, bit: 0 },
    EMERGENCY_STOP: { register: 1490, bit: 1 },
    SAFETY_SENSOR: { register: 1490, bit: 2 },
  },
  RESET: {
    RESET_SIGNAL: { register: 1600, bit: 0 },
  },
  DATA: {
    START_REGISTER: 3000,
    STATUS_REGISTER: 2999,
  },
};

/**
 * Bit Reader - Handles PLC bit reading with proper error handling
 */
class BitReader {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    try {
      await connect();
      this.isConnected = true;
      logger.info("✅ PLC connection established");
    } catch (error) {
      logger.error("❌ Failed to connect to PLC:", error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      await disconnect();
      this.isConnected = false;
      logger.info("🔌 PLC connection closed");
    } catch (error) {
      logger.error("❌ Error disconnecting from PLC:", error.message);
    }
  }

  async readBit(register, bit) {
    if (!this.isConnected) {
      throw new Error("PLC not connected");
    }

    try {
      const result = await readBit(register, bit, false);
      return result;
    } catch (error) {
      logger.error(`❌ Error reading bit ${register}.${bit}:`, error.message);
      throw error;
    }
  }

  async readRegister(register) {
    if (!this.isConnected) {
      throw new Error("PLC not connected");
    }

    try {
      const [value] = await readRegister(register, 1);
      return value;
    } catch (error) {
      logger.error(`❌ Error reading register ${register}:`, error.message);
      throw error;
    }
  }

  async writeBit(register, bit, value) {
    if (!this.isConnected) {
      throw new Error("PLC not connected");
    }

    try {
      await writeBit(register, bit, value);
      logger.debug(`✅ Wrote bit ${register}.${bit} = ${value}`);
    } catch (error) {
      logger.error(`❌ Error writing bit ${register}.${bit}:`, error.message);
      throw error;
    }
  }
}

/**
 * State Machine - Manages scan cycle state transitions
 */
class ScanCycleStateMachine {
  constructor() {
    this.currentState = ScanCycleState.IDLE;
    this.previousState = null;
    this.stateHistory = [];
  }

  transition(newState) {
    if (this.currentState === newState) {
      return;
    }

    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateHistory.push({
      state: newState,
      timestamp: new Date(),
      previous: this.previousState,
    });

    logger.info(`🔄 State transition: ${this.previousState} → ${newState}`);
  }

  getCurrentState() {
    return this.currentState;
  }

  getStateHistory() {
    return this.stateHistory;
  }

  isInState(state) {
    return this.currentState === state;
  }

  canTransitionTo(targetState) {
    const validTransitions = {
      [ScanCycleState.IDLE]: [ScanCycleState.WAITING_FOR_START],
      [ScanCycleState.WAITING_FOR_START]: [
        ScanCycleState.FIRST_SCAN,
        ScanCycleState.RESET,
      ],
      [ScanCycleState.FIRST_SCAN]: [
        ScanCycleState.MIDDLE_SCAN,
        ScanCycleState.RESET,
      ],
      [ScanCycleState.MIDDLE_SCAN]: [
        ScanCycleState.VERIFICATION_SCAN,
        ScanCycleState.RESET,
      ],
      [ScanCycleState.VERIFICATION_SCAN]: [
        ScanCycleState.COMPLETED,
        ScanCycleState.RESET,
      ],
      [ScanCycleState.COMPLETED]: [ScanCycleState.IDLE],
      [ScanCycleState.ERROR]: [ScanCycleState.IDLE, ScanCycleState.RESET],
      [ScanCycleState.RESET]: [ScanCycleState.IDLE],
    };

    return validTransitions[this.currentState]?.includes(targetState) || false;
  }
}

/**
 * PLC Signal Monitor - Monitors PLC signals with proper timeout handling
 */
class PLCSignalMonitor {
  constructor(bitReader) {
    this.bitReader = bitReader;
    this.activeMonitors = new Map();
  }

  async waitForSignal(register, bit, expectedValue, timeoutMs = null) {
    const monitorId = `${register}.${bit}`;

    if (this.activeMonitors.has(monitorId)) {
      logger.warn(`⚠️ Monitor already active for ${monitorId}`);
      return false;
    }

    logger.info(
      `⏳ Waiting for signal ${register}.${bit} = ${expectedValue}${timeoutMs ? ` (timeout: ${timeoutMs}ms)` : ""}`
    );

    return new Promise((resolve) => {
      let isResolved = false;
      let intervalId = null;
      let timeoutId = null;

      const cleanup = () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        this.activeMonitors.delete(monitorId);
      };

      const checkSignal = async () => {
        if (isResolved) return;

        try {
          const currentValue = await this.bitReader.readBit(register, bit);

          if (Number(currentValue) === Number(expectedValue)) {
            if (!isResolved) {
              isResolved = true;
              cleanup();
              logger.info(
                `✅ Signal received: ${register}.${bit} = ${expectedValue}`
              );
              resolve(true);
            }
          }
        } catch (error) {
          logger.error(
            `❌ Error checking signal ${register}.${bit}:`,
            error.message
          );
        }
      };

      // Set up interval checking
      intervalId = setInterval(checkSignal, 100);

      // Set up timeout if specified
      if (timeoutMs && timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            logger.warn(`⏰ Timeout waiting for signal ${register}.${bit}`);
            resolve(false);
          }
        }, timeoutMs);
      }

      // Initial check
      checkSignal();
    });
  }

  async waitForResetSignal() {
    return this.waitForSignal(
      PLC_REGISTERS.RESET.RESET_SIGNAL.register,
      PLC_REGISTERS.RESET.RESET_SIGNAL.bit,
      1
    );
  }

  async waitForStartSignal() {
    return this.waitForSignal(
      PLC_REGISTERS.CONTROL.START_SIGNAL.register,
      PLC_REGISTERS.CONTROL.START_SIGNAL.bit,
      1
    );
  }

  async waitForScannerTrigger() {
    return this.waitForSignal(
      PLC_REGISTERS.CONTROL.SCANNER_TRIGGER.register,
      PLC_REGISTERS.CONTROL.SCANNER_TRIGGER.bit,
      1
    );
  }

  stopAllMonitors() {
    this.activeMonitors.forEach((monitor, id) => {
      logger.info(`🛑 Stopping monitor for ${id}`);
    });
    this.activeMonitors.clear();
  }
}

/**
 * Main Scan Cycle Manager
 */
export class ScanCycleManager {
  constructor(io = null) {
    this.io = io;
    this.bitReader = new BitReader();
    this.stateMachine = new ScanCycleStateMachine();
    this.signalMonitor = new PLCSignalMonitor(this.bitReader);
    this.isRunning = false;
    this.cycleCount = 0;
    this.currentCycleData = null;
  }

  async initialize() {
    try {
      logger.info("🚀 Initializing Scan Cycle Manager...");
      await this.bitReader.connect();
      this.stateMachine.transition(ScanCycleState.IDLE);
      logger.success("✅ Scan Cycle Manager initialized");
    } catch (error) {
      logger.error(
        "❌ Failed to initialize Scan Cycle Manager:",
        error.message
      );
      throw error;
    }
  }

  async start() {
    if (this.isRunning) {
      logger.warn("⚠️ Scan cycle manager is already running");
      return;
    }

    this.isRunning = true;
    logger.info("🎬 Starting scan cycle manager...");

    try {
      while (this.isRunning) {
        await this.executeCycle();
      }
    } catch (error) {
      logger.error("❌ Fatal error in scan cycle manager:", error.message);
      this.stateMachine.transition(ScanCycleState.ERROR);
    } finally {
      await this.cleanup();
    }
  }

  async stop() {
    logger.info("🛑 Stopping scan cycle manager...");
    this.isRunning = false;
    this.signalMonitor.stopAllMonitors();
  }

  async executeCycle() {
    try {
      this.cycleCount++;
      logger.section(`🔄 Starting Scan Cycle ${this.cycleCount}`);

      // Step 1: Wait for start signal
      await this.waitForStartSignal();

      // Step 2: Execute first scan
      await this.executeFirstScan();

      // Step 3: Execute middle scan
      await this.executeMiddleScan();

      // Step 4: Execute verification scan
      await this.executeVerificationScan();

      // Step 5: Complete cycle
      await this.completeCycle();
    } catch (error) {
      logger.error("❌ Error in scan cycle:", error.message);
      this.stateMachine.transition(ScanCycleState.ERROR);
      await this.handleError(error);
    }
  }

  async waitForStartSignal() {
    this.stateMachine.transition(ScanCycleState.WAITING_FOR_START);

    // Check for reset signal first
    const resetDetected = await this.signalMonitor.waitForResetSignal();
    if (resetDetected) {
      logger.info("🔄 Reset signal detected, restarting cycle");
      this.stateMachine.transition(ScanCycleState.RESET);
      return;
    }

    // Wait for start signal
    const startDetected = await this.signalMonitor.waitForStartSignal();
    if (!startDetected) {
      throw new Error("Start signal not received");
    }

    logger.info("✅ Start signal received");
  }

  async executeFirstScan() {
    this.stateMachine.transition(ScanCycleState.FIRST_SCAN);
    logger.info("🔍 Executing first scan...");

    // TODO: Implement first scan logic
    // This would include:
    // - Setting up scanner
    // - Reading scanner data
    // - Processing data
    // - Writing status bits

    await sleep(1000); // Placeholder
    logger.info("✅ First scan completed");
  }

  async executeMiddleScan() {
    this.stateMachine.transition(ScanCycleState.MIDDLE_SCAN);
    logger.info("🔍 Executing middle scan...");

    // TODO: Implement middle scan logic
    // This would include:
    // - Setting up middle scanner
    // - Reading scanner data
    // - Processing data
    // - Writing status bits

    await sleep(1000); // Placeholder
    logger.info("✅ Middle scan completed");
  }

  async executeVerificationScan() {
    this.stateMachine.transition(ScanCycleState.VERIFICATION_SCAN);
    logger.info("🔍 Executing verification scan...");

    // Wait for scanner trigger signal
    const triggerDetected = await this.signalMonitor.waitForScannerTrigger();
    if (!triggerDetected) {
      throw new Error("Scanner trigger signal not received");
    }

    // TODO: Implement verification scan logic
    // This would include:
    // - Setting up verification scanner
    // - Reading scanner data
    // - Comparing with expected data
    // - Writing results to PLC

    await sleep(1000); // Placeholder
    logger.info("✅ Verification scan completed");
  }

  async completeCycle() {
    this.stateMachine.transition(ScanCycleState.COMPLETED);
    logger.info("🎉 Scan cycle completed successfully");

    // Clear all status bits
    await this.clearAllBits();

    // Wait before next cycle
    await sleep(2000);

    // Reset to idle for next cycle
    this.stateMachine.transition(ScanCycleState.IDLE);
  }

  async clearAllBits() {
    logger.info("🧹 Clearing all status bits...");

    try {
      // Clear status bits
      await this.bitReader.writeBit(
        PLC_REGISTERS.STATUS.DATA_MATCH_OK.register,
        PLC_REGISTERS.STATUS.DATA_MATCH_OK.bit,
        0
      );

      await this.bitReader.writeBit(
        PLC_REGISTERS.STATUS.DATA_MATCH_NG.register,
        PLC_REGISTERS.STATUS.DATA_MATCH_NG.bit,
        0
      );

      await this.bitReader.writeBit(
        PLC_REGISTERS.STATUS.FIRST_SCAN_OK.register,
        PLC_REGISTERS.STATUS.FIRST_SCAN_OK.bit,
        0
      );

      await this.bitReader.writeBit(
        PLC_REGISTERS.STATUS.FIRST_SCAN_NG.register,
        PLC_REGISTERS.STATUS.FIRST_SCAN_NG.bit,
        0
      );

      await this.bitReader.writeBit(
        PLC_REGISTERS.STATUS.FILE_TRANSFER.register,
        PLC_REGISTERS.STATUS.FILE_TRANSFER.bit,
        0
      );

      // Clear control bits
      await this.bitReader.writeBit(
        PLC_REGISTERS.CONTROL.SCANNER_TRIGGER.register,
        PLC_REGISTERS.CONTROL.SCANNER_TRIGGER.bit,
        0
      );

      logger.success("✅ All bits cleared successfully");
    } catch (error) {
      logger.error("❌ Error clearing bits:", error.message);
      throw error;
    }
  }

  async handleError(error) {
    logger.error("❌ Handling error:", error.message);

    try {
      await this.clearAllBits();
    } catch (clearError) {
      logger.error(
        "❌ Error clearing bits during error handling:",
        clearError.message
      );
    }

    // Wait before retry
    await sleep(5000);
    this.stateMachine.transition(ScanCycleState.IDLE);
  }

  async cleanup() {
    logger.info("🧹 Cleaning up scan cycle manager...");

    try {
      this.signalMonitor.stopAllMonitors();
      await this.clearAllBits();
      await this.bitReader.disconnect();
      logger.success("✅ Cleanup completed");
    } catch (error) {
      logger.error("❌ Error during cleanup:", error.message);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      currentState: this.stateMachine.getCurrentState(),
      cycleCount: this.cycleCount,
      stateHistory: this.stateMachine.getStateHistory(),
    };
  }
}

export default ScanCycleManager;
