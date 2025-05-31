/* eslint-disable consistent-return */
import { SerialPort } from "serialport";
import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";
import EventEmitter from "events";
import process from "process";

class BufferedComPortService extends EventEmitter {
  constructor(options = {}) {
    super(); // Initialize EventEmitter
    this.options = {
      path: options.path || process.env.SERIAL_PORT || "COM3",
      baudRate: parseInt(options.baudRate || process.env.BAUD_RATE, 10) || 9600,
      logDir: options.logDir || "logs",
    };
    this.port = null;
    this.isInitialized = false;
    this.dataBuffer = ""; // Buffer to accumulate characters
    this.bufferTimeout = null; // Timeout to emit buffered data
    this.setupLogger();
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
      this.log(
        `Connecting to ${this.options.path} at ${this.options.baudRate} baud...`
      );

      this.port = new SerialPort({
        path: this.options.path,
        baudRate: this.options.baudRate,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        flowControl: false,
        // Exact settings that worked in our test
        rtscts: false,
        xon: false,
        xoff: false,
        xany: false,
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

    // Buffer scanner data since it comes character by character
    this.port.on("data", (buffer) => {
      const newData = buffer.toString().trim();

      if (newData) {
        this.log(`Raw data chunk received: "${newData}"`, "debug");

        // Add to buffer
        this.dataBuffer += newData;

        // Clear existing timeout
        if (this.bufferTimeout) {
          clearTimeout(this.bufferTimeout);
        }

        // Check if we have what looks like a complete scanner message
        const isCompleteMessage = this.isCompleteMessage(this.dataBuffer);

        if (isCompleteMessage) {
          // Process concatenated responses and extract the final valid message
          const finalMessage = this.extractFinalMessage(this.dataBuffer);
          this.log(`Complete scanner message detected: "${finalMessage}"`);
          this.emit("dataGot", finalMessage);
          this.dataBuffer = ""; // Clear buffer
        } else {
          // Set longer timeout to wait for more data (500ms instead of 100ms)
          this.bufferTimeout = setTimeout(() => {
            if (this.dataBuffer) {
              this.log(
                `Buffered scanner data timeout reached: "${this.dataBuffer}"`
              );
              this.emit("dataGot", this.dataBuffer);
              this.dataBuffer = ""; // Clear buffer
            }
          }, 500); // Increased to 500ms for better buffering
        }
      }
    });

    this.port.on("error", (err) => {
      this.log(`Port error: ${err.message}`, "error");
      this.emit("error", err);
    });

    this.port.on("close", () => {
      this.log("Port closed", "info");
      this.isInitialized = false;
      // Clear any pending timeout
      if (this.bufferTimeout) {
        clearTimeout(this.bufferTimeout);
        this.bufferTimeout = null;
      }
    });

    this.port.on("disconnect", () => {
      this.log("Port disconnected", "warn");
      this.isInitialized = false;
      // Clear any pending timeout
      if (this.bufferTimeout) {
        clearTimeout(this.bufferTimeout);
        this.bufferTimeout = null;
      }
    });
  }

  // Helper method to detect if we have a complete scanner message
  isCompleteMessage(data) {
    const trimmedData = data.trim();

    // All scanner messages now end with @ delimiter
    if (trimmedData.includes("@")) {
      this.log(
        `Complete message detected (@ found): "${trimmedData}"`,
        "debug"
      );
      return true;
    }

    // For very short data, likely incomplete
    if (trimmedData.length < 2) {
      this.log(`Data too short: "${trimmedData}"`, "debug");
      return false;
    }

    // Default to incomplete for other cases (waiting for @)
    this.log(
      `Data appears incomplete (waiting for @): "${trimmedData}"`,
      "debug"
    );
    return false;
  }

  // Helper method to extract the final meaningful message from concatenated responses
  extractFinalMessage(data) {
    const trimmedData = data.trim();

    // Split by @ and get the last non-empty segment
    const segments = trimmedData
      .split("@")
      .filter((segment) => segment.trim() !== "");

    if (segments.length === 0) {
      this.log(`No valid segments found in: "${trimmedData}"`, "debug");
      return trimmedData;
    }

    // Get the last complete segment
    const lastSegment = segments[segments.length - 1].trim();

    this.log(
      `Extracted final message: "${lastSegment}" from segments: [${segments.join(", ")}]`,
      "debug"
    );
    return lastSegment;
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
          // Clear any pending timeout
          if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
          }
          resolve();
        }
      });
    });
  }
}

export default BufferedComPortService;
