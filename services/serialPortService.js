const SerialPort = require("serialport").SerialPort;
const ReadlineParser = require("@serialport/parser-readline").ReadlineParser;
const fs = require("fs");
const path = require("path");
// const robot = require("robotjs");
const logger = require("../logger.js");
const {
  updateBuffer,
  // processFirstScan,
  processSecondScan,
  clearCodeFile,
} = require("./scanUtils.js");
const { MockSerialPort } = require("./mockSerialPort.js");
const { fileURLToPath } = require("url");
const {
  handlePortClose,
  handlePortDisconnect,
  handlePortDrain,
  handlePortError,
  handlePortFlush,
  handlePortOpen,
} = require("./portUtils.js");
const {
  readRegister,
  readRegisterAndProvideASCII,
  writeBit,
} = require("./modbus.js");
const { getData } = require("./lowDbService.js");
const { emitErrorEvent } = require("./utils.js");
// Import the error utility

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buffer = "";
const firstScanData = null;
const codeWritten = false;
const specialCodeCounter = 1;

const codeFormat = () => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const increment = String(specialCodeCounter).padStart(4, "0");
  return `${dd}${mm}${yy}${increment}`;
};

module.exports = {
  waitForBitToBecomeOne,
  handleFirstScan,
  handleSecondScan,
  watchCodeFile,
};
