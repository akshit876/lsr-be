import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import fs from "fs";
import path, { dirname } from "path";
import robot from "robotjs";
import logger from "../logger.js";
import {
  updateBuffer,
  // processFirstScan,
  processSecondScan,
  clearCodeFile,
} from "./scanUtils.js";
import { MockSerialPort } from "./mockSerialPort.js";
import { fileURLToPath } from "url";
import {
  handlePortClose,
  handlePortDisconnect,
  handlePortDrain,
  handlePortError,
  handlePortFlush,
  handlePortOpen,
} from "./portUtils.js";
import {
  readRegister,
  readRegisterAndProvideASCII,
  writeBit,
} from "./modbus.js";
import { getData } from "./lowDbService.js";
import { emitErrorEvent } from "./utils.js";
// Import the error utility

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const buffer = "";
let firstScanData = null;
let codeWritten = false;
let specialCodeCounter = 1;

const codeFormat = () => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const increment = String(specialCodeCounter).padStart(4, "0");
  return `${dd}${mm}${yy}${increment}`;
};

export async function waitForBitToBecomeOne(register, bit) {
  // Log once at the beginning, indicating that we are waiting for the bit to become 1
  console.log(`Waiting for bit ${bit} on register ${register} to become 1...`);

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const bitValue = await readRegister(register, 1, true, bit, false);
      if ((bitValue & (1 << bit)) !== 0) {
        // Check if the bit is set to 1
        clearInterval(interval); // Clear the interval once the bit is detected
        resolve(); // Resolve the promise, allowing the caller to proceed
      }
    }, 100); // Check every 100ms
  });
}
/**
 *
 * @param {*} io cycle start read register 1400,0
 *   then read data from scanner 1470 -> read 20 bit
 *   if ok -> machine not to proceed ahead  1414,.d 13 wrie to plc
 *   else ng  -> 1414 14 write this to plc
 *   ocr read -> 1410 1 read from plc
 *   then continue to read from it 1450 20 bit
 *   write to plc ki ocr read for first time 1414 15
 *   for now direct send ocr data into code.txt
 *   1410 2 read from plc send data to laser means write into code.txt
 * wrtie to plc confimatoin into 1415 1 on
 * then scan position it comes into
 *  3rd cycle scanning
 *   1410  3  read from plc to begin reading data from scanner
 *   scanner data 1470 20 bit
 *   grade if found or not
 *   data matching code.txt and scanner data
 * write to plc
 *  ok -> 1414 13
 *ng ->1414 14
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 * @param {*} part
 */

export async function handleFirstScan(io, part) {
  // firstScanData = processFirstScan(part);
  firstScanData = 1;
  console.log("firstScanData", firstScanData);

  if (firstScanData === "NG") {
    try {
      await waitForBitToBecomeOne(1400, 1);
      const cameraData = await readRegisterAndProvideASCII(1450, 15);
      const cameraDataString = String.fromCharCode(...cameraData);

      const DEFAULT_CAMERA_DATA = await getData("defaultCameraData");

      if (cameraDataString !== DEFAULT_CAMERA_DATA) {
        io.emit("alert", { message: "Camera data incorrect" });
        emitErrorEvent(io, "CAMERA_DATA_MISMATCH", "Camera data incorrect");
      } else {
        const specialCode = codeFormat();
        specialCodeCounter++;
        const finalCode = `${specialCode}${cameraDataString}`;
        await clearCodeFile("code.txt");
        fs.writeFileSync(path.join(__dirname, "../data/code.txt"), finalCode);

        logger.info(`Final code generated and written: ${finalCode}`);

        robot.keyTap("f2");
        logger.info("F2 key press simulated");
      }
    } catch (error) {
      emitErrorEvent(
        io,
        "FIRST_SCAN_ERROR",
        `Error during first scan: ${error.message}`
      );
      logger.error("Error during first scan:", error);
    }
  } else {
    logger.info(
      "Machine won't run further since the component is already marked."
    );
    io.emit("machine-stop", {
      message:
        "Machine won't run further since the component is already marked.",
    });
    emitErrorEvent(io, "MACHINE_STOP", "Component already marked");
    firstScanData = null;
    codeWritten = false;
  }
}

export async function handleSecondScan(io, part) {
  try {
    processSecondScan(part, firstScanData);
  } catch (error) {
    emitErrorEvent(
      io,
      "SECOND_SCAN_ERROR",
      `Error during second scan: ${error.message}`
    );
    logger.error("Error during second scan:", error);
  }
}

export function watchCodeFile() {
  const filePath = path.join(__dirname, "../data/code.txt");

  fs.watch(filePath, (eventType) => {
    if (eventType === "change") {
      const stats = fs.statSync(filePath);
      if (stats.size > 0) {
        logger.info("Manual code written to file");
        codeWritten = true;
      }
    }
  });
}
