/* eslint-disable consistent-return */
import { SerialPort } from "serialport";
import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";
import async from "async";
import EventEmitter from "events";
import { sleep } from "./testCycle.js";

class BufferedComPortService extends EventEmitter {
  constructor(options = {}) {
    super(); // Initialize EventEmitter
    this.options = {
      path: options.path || process.env.SERIAL_PORT || "COM3",
      baudRate: parseInt(options.baudRate || process.env.BAUD_RATE, 10) || 9600,
      logDir: options.logDir || "logs",
    };
    this.port = null;
    this.buffer = "";
    this.isInitialized = false;
    this.setupLogger();

    // Initialize async.queue for in-memory job handling
    this.dataQueue = async.queue(async (task, callback) => {
      console.log(`Emitting the data first: ${task.line}`);
      this.emit("dataGot", task.line);
      await sleep(1000);
      console.log(`Processing data from queue: ${task.line}`);
      this.log(`Processing data from queue: ${task.line}`, "info");
      // Add custom processing logic here, like saving to a database or other transformations
      callback(); // Signal that the job is done
    }, 2); // Set concurrency to 1 to process one task at a time
  }

  setupLogger() {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level}]: ${message}`;
      })
    );

    this.logger = winston.createLogger({
      level: "info",
      format: logFormat,
      transports: [
        new winston.transports.Console(),
        new winston.transports.DailyRotateFile({
          filename: path.join(this.options.logDir, "application-%DATE%.log"),
          datePattern: "YYYY-MM-DD",
          zippedArchive: true,
          maxSize: "20m",
          maxFiles: "14d",
        }),
      ],
    });
  }

  log(message, level = "info") {
    this.logger.log(level, message);
  }

  async initSerialPort() {
    if (this.isInitialized) {
      this.log("Serial port is already initialized");
      return;
    }

    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: this.options.path,
        baudRate: this.options.baudRate,
        autoOpen: false,
      });

      this.port.open((err) => {
        if (err) {
          this.log(`Error opening port: ${err.message}`, "error");
          reject(err);
        } else {
          this.log("Port opened successfully");
          this.setupListeners();
          this.isInitialized = true;
          resolve();
        }
      });
    });
  }

  setupListeners() {
    this.port.on("data", (data) => {
      this.buffer += data.toString("utf8");
      this.log(`Received raw data: ${data.toString("utf8")}`, "debug");
      this.processBuffer();
    });

    this.port.on("error", (err) => {
      this.log(`Port error: ${err.message}`, "error");
    });
  }

  processBuffer() {
    let lineEnd = this.buffer.indexOf("\n");
    while (lineEnd > -1) {
      const line = this.buffer.slice(0, lineEnd).trim();
      if (line) {
        this.log(`Processed line: ${line}`, "info");
        // Add the processed line to the queue
        this.dataQueue.push({ line });
        // Emit an event with the scanner data
        this.emit("dataGot", line);
      }
      this.buffer = this.buffer.slice(lineEnd + 1);
      lineEnd = this.buffer.indexOf("\n");
    }
  }

  clearBuffer() {
    this.buffer = ""; // Clear the buffer before second scan
  }

  async closePort() {
    if (!this.isInitialized) {
      this.log("Port is not initialized, nothing to close");
      return;
    }

    return new Promise((resolve, reject) => {
      this.port.close((err) => {
        if (err) {
          this.log(`Error closing port: ${err.message}`, "error");
          reject(err);
        } else {
          this.log("Port closed successfully");
          this.isInitialized = false;
          resolve();
        }
      });
    });
  }
}

export default BufferedComPortService;
