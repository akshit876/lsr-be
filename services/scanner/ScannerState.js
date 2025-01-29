import logger from "../../logger.js";

export class ScannerState {
  constructor() {
    this.reset();
  }

  reset() {
    this.isInitialized = false;
    this.isRunning = false;
    this.cycleCount = 0;
    this.isPulseOn = false;
    this.currentDayId = 1;
    this.lastResetDate = this.getLastResetTime();
    this.plcConnected = false;
    this.isScanning = false;
    this.io = null;
    this.comService = null;
    this.currentPartNumber = null;
    this.reconnectionAttemptInProgress = false;
  }

  setupScanState(io, comService, partNumber) {
    this.io = io;
    this.comService = comService;
    this.currentPartNumber = partNumber;
    this.isRunning = true;
    this.cycleCount = 0;
  }

  incrementCycleCount() {
    this.cycleCount++;
    logger.section(`✅ Completed Scan Cycle ${this.cycleCount}`);
  }

  getLastResetTime() {
    const now = new Date();
    const resetTime = new Date(now);
    resetTime.setHours(6, 0, 0, 0);

    if (now < resetTime) {
      resetTime.setDate(resetTime.getDate() - 1);
    }

    return resetTime;
  }

  async getCurrentDayId() {
    const now = new Date();
    const nextResetTime = new Date(this.lastResetDate);
    nextResetTime.setDate(nextResetTime.getDate() + 1);

    if (now >= nextResetTime) {
      this.currentDayId = 1;
      this.lastResetDate = this.getLastResetTime();
    }

    return this.currentDayId++;
  }

  emitSocketEvent(eventName, data) {
    if (this.io) {
      this.io.emit(eventName, {
        timestamp: new Date(),
        ...data,
      });
    }
  }
}
