export class ScannerError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScannerError";
  }
}

export class ResetError extends ScannerError {
  constructor(message) {
    super(message);
    this.name = "ResetError";
  }
}

export class ModbusError extends ScannerError {
  constructor(message) {
    super(message);
    this.name = "ModbusError";
  }
}
