// Manages scanner state and configuration
class ScannerState {
  constructor() {
    this.isRunning = false;
    this.resetPending = false;
    this.isInitialized = false;
    this.cycleCount = 0;
    this.isPulseOn = false;
    this.currentDayId = 1;
    this.lastResetDate = null;
    this.isScanning = false;
    this.currentPartNumber = null;
    this.io = null;
  }

  reset() {
    this.cycleCount = 0;
    this.resetPending = false;
    this.isScanning = false;
  }

  setRunning(value) {
    this.isRunning = value;
  }

  incrementCycle() {
    this.cycleCount++;
  }
}

export default new ScannerState();
