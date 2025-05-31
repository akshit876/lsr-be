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
      baudRate:
        parseInt(options.baudRate || process.env.BAUD_RATE, 10) || 115200,
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

    // Handle NG responses - complete without @ delimiter
    if (trimmedData === "NG" || trimmedData.endsWith("NG")) {
      this.log(`Complete NG message detected: "${trimmedData}"`, "debug");
      return true;
    }

    // Handle successful scans - complete when we see @ delimiter
    if (trimmedData.includes("@")) {
      this.log(
        `Complete success message detected (@ found): "${trimmedData}"`,
        "debug"
      );
      return true;
    }

    // For numeric data without @, not yet complete
    if (trimmedData.length > 0 && /^\d+$/.test(trimmedData)) {
      this.log(
        `Incomplete numeric data (waiting for @): "${trimmedData}"`,
        "debug"
      );
      return false;
    }

    // For very short data, likely incomplete
    if (trimmedData.length < 2) {
      return false;
    }

    // Default to incomplete for other cases
    this.log(`Data appears incomplete: "${trimmedData}"`, "debug");
    return false;
  }

  // Helper method to extract the final meaningful message from concatenated responses
  extractFinalMessage(data) {
    const trimmedData = data.trim();

    // Check for successful scan with @ delimiter
    const atIndex = trimmedData.lastIndexOf("@");
    if (atIndex !== -1) {
      // Find the start of the numeric sequence before @
      let startIndex = atIndex - 1;
      while (startIndex >= 0 && /\d/.test(trimmedData[startIndex])) {
        startIndex--;
      }
      const successMessage = trimmedData.substring(startIndex + 1, atIndex + 1);
      this.log(`Extracted success message: "${successMessage}"`, "debug");
      return successMessage;
    }

    // Check for NG at the end
    if (trimmedData.endsWith("NG")) {
      this.log(`Extracted NG message from: "${trimmedData}"`, "debug");
      return "NG";
    }

    // Fallback: return the entire trimmed data
    this.log(
      `No special pattern found, returning entire data: "${trimmedData}"`,
      "debug"
    );
    return trimmedData;
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
