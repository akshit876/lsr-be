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
      host: options.host || process.env.SCANNER_HOST || "192.168.1.100",
      port: parseInt(options.port || process.env.SCANNER_PORT, 10) || 4001,
      timeout: options.timeout || 10000, // 10 second timeout
      reconnectInterval: options.reconnectInterval || 5000, // 5 second reconnection interval
      logDir: options.logDir || "logs",
    };
    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.dataBuffer = ""; // Buffer to accumulate characters
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
    if (this.isConnected || this.isConnecting) {
      this.log("TCP connection is already established or connecting");
      return;
    }

    return new Promise((resolve, reject) => {
      this.isConnecting = true;
      this.log(
        `Connecting to TCP scanner at ${this.options.host}:${this.options.port}...`
      );

      this.client = new net.Socket();
      this.client.setTimeout(this.options.timeout);

      this.client.connect(this.options.port, this.options.host, () => {
        this.log("TCP connection established successfully");
        this.isConnected = true;
        this.isConnecting = false;
        this.setupListeners();
        resolve();
      });

      this.client.on("error", (err) => {
        this.log(`TCP connection error: ${err.message}`, "error");
        this.isConnecting = false;
        this.isConnected = false;
        reject(err);
      });

      this.client.on("timeout", () => {
        this.log("TCP connection timeout", "error");
        this.isConnecting = false;
        this.isConnected = false;
        this.client.destroy();
        reject(new Error("Connection timeout"));
      });
    });
  }

  setupListeners() {
    this.log("Setting up TCP data listeners with smart buffering");

    // Buffer scanner data since it may come in chunks
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
          // Process concatenated responses and extract the final valid message
          const finalMessage = this.extractFinalMessage(this.dataBuffer);
          this.log(`Complete TCP scanner message detected: "${finalMessage}"`);
          this.emit("dataGot", finalMessage);
          this.dataBuffer = ""; // Clear buffer
        } else {
          // Set longer timeout to wait for more data (500ms)
          this.bufferTimeout = setTimeout(() => {
            if (this.dataBuffer) {
              this.log(
                `Buffered TCP scanner data timeout reached: "${this.dataBuffer}"`
              );
              this.emit("dataGot", this.dataBuffer);
              this.dataBuffer = ""; // Clear buffer
            }
          }, 500);
        }
      }
    });

    this.client.on("error", (err) => {
      this.log(`TCP client error: ${err.message}`, "error");
      this.isConnected = false;
      this.emit("error", err);
      this.scheduleReconnect();
    });

    this.client.on("close", (hadError) => {
      this.log(
        `TCP connection closed ${hadError ? "due to error" : "normally"}`,
        "info"
      );
      this.isConnected = false;
      // Clear any pending timeout
      if (this.bufferTimeout) {
        clearTimeout(this.bufferTimeout);
        this.bufferTimeout = null;
      }
      if (hadError) {
        this.scheduleReconnect();
      }
    });

    this.client.on("end", () => {
      this.log("TCP connection ended by server", "warn");
      this.isConnected = false;
      this.scheduleReconnect();
    });
  }

  // Helper method to detect if we have a complete scanner message
  isCompleteMessage(data) {
    const trimmedData = data.trim();

    // Scanner messages end with @ delimiter (keeping same logic as COM port service)
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

    // You can modify this logic based on your TCP scanner's message format
    // For example, if messages end with \r\n, \n, or have a specific length
    if (trimmedData.includes("\r\n") || trimmedData.includes("\n")) {
      this.log(
        `Complete message detected (newline found): "${trimmedData}"`,
        "debug"
      );
      return true;
    }

    // Default to incomplete for other cases
    this.log(`Data appears incomplete: "${trimmedData}"`, "debug");
    return false;
  }

  // Helper method to extract the final meaningful message from concatenated responses
  extractFinalMessage(data) {
    const trimmedData = data.trim();

    // Split by @ and get the last non-empty segment (keeping same logic)
    const segments = trimmedData
      .split("@")
      .filter((segment) => segment.trim() !== "");

    if (segments.length === 0) {
      // Try splitting by newlines if @ delimiter not found
      const lineSegments = trimmedData
        .split(/\r?\n/)
        .filter((segment) => segment.trim() !== "");

      if (lineSegments.length > 0) {
        const lastSegment = lineSegments[lineSegments.length - 1].trim();
        this.log(
          `Extracted final message from lines: "${lastSegment}"`,
          "debug"
        );
        return lastSegment;
      }

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

  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.log(
      `Scheduling reconnection in ${this.options.reconnectInterval}ms`,
      "info"
    );
    this.reconnectTimer = setTimeout(async () => {
      this.log("Attempting to reconnect...", "info");
      try {
        await this.initTcpConnection();
        this.log("Reconnection successful", "info");
      } catch (error) {
        this.log(`Reconnection failed: ${error.message}`, "error");
        // Will automatically schedule another reconnect due to error handling
      }
    }, this.options.reconnectInterval);
  }

  async sendCommand(command) {
    if (!this.isConnected || !this.client) {
      throw new Error("TCP connection not established");
    }

    return new Promise((resolve, reject) => {
      this.client.write(command, (err) => {
        if (err) {
          this.log(`Error sending command: ${err.message}`, "error");
          reject(err);
        } else {
          this.log(`Command sent successfully: "${command}"`, "debug");
          resolve();
        }
      });
    });
  }

  async closeConnection() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (!this.client) {
      this.log("No TCP connection to close");
      return;
    }

    return new Promise((resolve) => {
      if (this.isConnected) {
        this.client.end(() => {
          this.log("TCP connection closed successfully");
          this.isConnected = false;
          // Clear any pending timeout
          if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
          }
          resolve();
        });
      } else {
        this.client.destroy();
        this.log("TCP connection destroyed");
        this.isConnected = false;
        if (this.bufferTimeout) {
          clearTimeout(this.bufferTimeout);
          this.bufferTimeout = null;
        }
        resolve();
      }
    });
  }

  // Method to check if connection is alive
  isConnectionAlive() {
    return this.isConnected && this.client && !this.client.destroyed;
  }

  // Method to get connection status info
  getConnectionInfo() {
    return {
      host: this.options.host,
      port: this.options.port,
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      hasClient: !!this.client,
      clientDestroyed: this.client ? this.client.destroyed : true,
    };
  }
}

export default TcpScannerService;
