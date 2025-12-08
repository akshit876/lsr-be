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
      path: options.path || process.env.SERIAL_PORT || "COM5",
      baudRate: parseInt(options.baudRate || process.env.BAUD_RATE, 10) || 9600,
      logDir: options.logDir || "logs",
    };
    this.port = null;
    this.dataBuffer = "";
    this.bufferTimeout = null;
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
    this.log("Setting up improved data listeners with smart buffering");

    // Buffer scanner data since it can come in chunks without delimiters
    this.port.on("data", (buffer) => {
      const newData = buffer.toString(); // preserve spaces and content as-is

      if (newData) {
        this.log(`Raw data chunk received: "${newData}"`, "debug");

        // Add to buffer
        this.dataBuffer += newData;

        // Clear existing timeout
        if (this.bufferTimeout) {
          clearTimeout(this.bufferTimeout);
        }

        // No explicit delimiter now; emit after short idle period
        this.bufferTimeout = setTimeout(() => {
          if (this.dataBuffer) {
            this.log(
              `Buffered scanner data timeout reached: "${this.dataBuffer}"`
            );
            this.emit("dataGot", this.dataBuffer);
            this.dataBuffer = ""; // Clear buffer
          }
        }, 500);
      }
    });

    this.port.on("error", (err) => {
      this.log(`Port error: ${err.message}`, "error");
    });
  }

  // Delimiter-based helpers removed; using idle-timeout buffering instead

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
