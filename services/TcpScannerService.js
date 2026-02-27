import net from "net";
import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";
import EventEmitter from "events";
import process from "process";

class TcpScannerService extends EventEmitter {
  constructor(options = {}) {
    super(); // Initialize EventEmitter
    this.options = {
      host: options.host || process.env.SCANNER_HOST || "192.168.3.146",
      port: parseInt(options.port || process.env.SCANNER_PORT, 10) || 502,
      timeout: options.timeout || 5000,
      reconnectInterval: options.reconnectInterval || 3000,
      keepAlive: options.keepAlive !== false, // Enable keep-alive by default
      keepAliveInitialDelay: options.keepAliveInitialDelay || 1000,
      logDir: options.logDir || "scanner_logs",
    };
    this.client = null;
    this.isConnected = false;
    this.isInitialized = false;
    this.dataBuffer = ""; // Buffer to accumulate data
    this.bufferTimeout = null; // Timeout to emit buffered data
    this.reconnectTimer = null;
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
          filename: path.join(this.options.logDir, "tcp-scanner-%DATE%.log"),
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

  async initTcpConnection() {
    if (this.isInitialized) {
      this.log("TCP scanner connection is already initialized");
      return;
    }

    return new Promise((resolve, reject) => {
      this.log(
        `Connecting to TCP scanner at ${this.options.host}:${this.options.port}...`
      );

      this.client = new net.Socket();

      // Don't set a timeout on the socket itself - let it stay open
      // The timeout is only for the initial connection
      this.client.setTimeout(this.options.timeout);

      // Enable keep-alive to prevent idle connection timeouts
      if (this.options.keepAlive) {
        this.client.setKeepAlive(true, this.options.keepAliveInitialDelay);
        this.log(
          `Keep-alive enabled with initial delay: ${this.options.keepAliveInitialDelay}ms`
        );
      }

      // Set up event listeners before connecting
      this.setupListeners();

      this.client.connect(this.options.port, this.options.host, () => {
        this.log("TCP scanner connected successfully");
        this.isConnected = true;
        this.isInitialized = true;

        // Clear the connection timeout once connected
        this.client.setTimeout(0);

        // Clear any existing reconnect timer
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        resolve();
      });

      this.client.on("error", (err) => {
        this.log(`Error connecting to TCP scanner: ${err.message}`, "error");
        this.isConnected = false;
        reject(err);
      });
    });
  }

  setupListeners() {
    this.log("Setting up TCP scanner data listeners with smart buffering");

    // Handle incoming data from TCP scanner
    this.client.on("data", (buffer) => {
      const newData = buffer.toString().trim();

      if (newData) {
        this.log(`Raw TCP data chunk received: "${newData}"`, "debug");

        // Add to buffer
        this.dataBuffer += newData;

        // Clear existing timeout
        if (this.bufferTimeout) {
          clearTimeout(this.bufferTimeout);
        }

        // Check if we have what looks like a complete scanner message
        const isCompleteMessage = this.isCompleteMessage(this.dataBuffer);

        if (isCompleteMessage) {
          // Process and extract the final valid message
          const finalMessage = this.extractFinalMessage(this.dataBuffer);
          this.log(`Complete TCP scanner message detected: "${finalMessage}"`);
          this.emit("dataGot", finalMessage);
          this.dataBuffer = ""; // Clear buffer
        } else {
          // Set timeout to wait for more data
          this.bufferTimeout = setTimeout(() => {
            if (this.dataBuffer) {
              this.log(
                `Buffered TCP scanner data timeout reached: "${this.dataBuffer}"`
              );
              this.emit("dataGot", this.dataBuffer);
              this.dataBuffer = ""; // Clear buffer
            }
          }, 500); // 500ms timeout for better buffering
        }
      }
    });

    this.client.on("error", (err) => {
      this.log(`TCP scanner error: ${err.message}`, "error");
      this.isConnected = false;
      this.emit("error", err);
      this.scheduleReconnect();
    });

    this.client.on("close", () => {
      this.log("TCP scanner connection closed", "info");
      this.isConnected = false;
      // Clear any pending timeout
      if (this.bufferTimeout) {
        clearTimeout(this.bufferTimeout);
        this.bufferTimeout = null;
      }
      this.scheduleReconnect();
    });

    this.client.on("timeout", () => {
      this.log(
        "TCP scanner connection timeout during initial connection",
        "warn"
      );
      this.client.destroy();
    });

    this.client.on("end", () => {
      this.log("TCP scanner connection ended", "info");
      this.isConnected = false;
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    this.log(`Scheduling reconnection in ${this.options.reconnectInterval}ms`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        this.log("Attempting to reconnect to TCP scanner...");
        await this.initTcpConnection();
        this.log("TCP scanner reconnected successfully");
      } catch (error) {
        this.log(`Reconnection failed: ${error.message}`, "error");
        // scheduleReconnect will be called again from the error handler
      }
    }, this.options.reconnectInterval);
  }

  // Helper method to detect if we have a complete scanner message
  isCompleteMessage(data) {
    const trimmedData = data.trim();

    // Scanner messages end with @ delimiter (same as COM port implementation)
    if (trimmedData.includes("@")) {
      this.log(
        `Complete TCP message detected (@ found): "${trimmedData}"`,
        "debug"
      );
      return true;
    }

    // For very short data, likely incomplete
    if (trimmedData.length < 2) {
      this.log(`TCP data too short: "${trimmedData}"`, "debug");
      return false;
    }

    // Default to incomplete for other cases (waiting for @)
    this.log(
      `TCP data appears incomplete (waiting for @): "${trimmedData}"`,
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
      this.log(`No valid TCP segments found in: "${trimmedData}"`, "debug");
      return trimmedData;
    }

    // Get the last complete segment
    const lastSegment = segments[segments.length - 1].trim();

    this.log(
      `Extracted final TCP message: "${lastSegment}" from segments: [${segments.join(", ")}]`,
      "debug"
    );
    return lastSegment;
  }

  // Send command to TCP scanner (if needed for triggering scans)
  async sendCommand(command) {
    if (!this.isConnected || !this.client) {
      throw new Error("TCP scanner not connected");
    }

    return new Promise((resolve, reject) => {
      this.log(`Sending command to TCP scanner: "${command}"`);

      this.client.write(command + "\n", (err) => {
        if (err) {
          this.log(`Error sending command: ${err.message}`, "error");
          reject(err);
        } else {
          this.log(`Command sent successfully: "${command}"`);
          resolve();
        }
      });
    });
  }

  async closeConnection() {
    if (!this.isInitialized) {
      this.log("TCP scanner connection is not initialized, nothing to close");
      return;
    }

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clear buffer timeout
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
      this.bufferTimeout = null;
    }

    return new Promise((resolve, reject) => {
      if (this.client) {
        this.client.end(() => {
          this.log("TCP scanner connection closed successfully");
          this.isConnected = false;
          this.isInitialized = false;
          this.client = null;
          resolve();
        });

        // Force close after timeout
        setTimeout(() => {
          if (this.client) {
            this.client.destroy();
            this.isConnected = false;
            this.isInitialized = false;
            this.client = null;
            resolve();
          }
        }, 5000);
      } else {
        resolve();
      }
    });
  }

  // Check if scanner is connected
  isReady() {
    return this.isConnected && this.client && !this.client.destroyed;
  }

  // Get connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      isInitialized: this.isInitialized,
      host: this.options.host,
      port: this.options.port,
      hasClient: !!this.client,
      clientDestroyed: this.client ? this.client.destroyed : true,
    };
  }
}

export default TcpScannerService;
