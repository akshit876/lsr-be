import net from "net";
import logger from "../logger.js";

class TCPClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectInterval = 5000; // 5 seconds
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 0; // 0 means infinite attempts
    this.connectionConfig = null;
    this.pendingConnection = null;
  }

  async connect(config) {
    // Save config for reconnection attempts
    this.connectionConfig = config;

    // If already connecting, return the pending connection
    if (this.pendingConnection) {
      return this.pendingConnection;
    }

    // If already connected, return immediately
    if (this.isConnected && this.client) {
      return Promise.resolve();
    }

    // Create new connection promise
    this.pendingConnection = new Promise((resolve, reject) => {
      try {
        logger.info(
          `Attempting to connect to scanner at ${config.host}:${config.port}`
        );

        this.client = new net.Socket();

        // Setup event handlers
        this.client.on("connect", () => {
          logger.success(
            `Connected to scanner at ${config.host}:${config.port}`
          );
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.pendingConnection = null;
          resolve();
        });

        this.client.on("error", (error) => {
          logger.error(`Scanner connection error: ${error.message}`);
          this.handleError(error);
        });

        this.client.on("close", () => {
          logger.warn("Scanner connection closed");
          this.handleDisconnect();
        });

        this.client.on("end", () => {
          logger.warn("Scanner connection ended");
          this.handleDisconnect();
        });

        // Attempt connection
        this.client.connect(config);
      } catch (error) {
        this.pendingConnection = null;
        this.handleError(error);
        reject(error);
      }
    });

    return this.pendingConnection;
  }

  handleError(error) {
    this.isConnected = false;
    this.pendingConnection = null;

    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
      this.scheduleReconnect();
    }
  }

  handleDisconnect() {
    if (this.isConnected) {
      logger.warn("Scanner connection lost");
    }
    this.isConnected = false;
    this.pendingConnection = null;
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (
      this.connectionConfig &&
      (this.maxReconnectAttempts === 0 ||
        this.reconnectAttempts < this.maxReconnectAttempts)
    ) {
      this.reconnectAttempts++;
      logger.info(
        `Scheduling scanner reconnection attempt ${this.reconnectAttempts} in ${this.reconnectInterval / 1000} seconds...`
      );

      setTimeout(() => {
        if (!this.isConnected && !this.pendingConnection) {
          this.connect(this.connectionConfig).catch(() => {
            // Error handling is done in connect() method
          });
        }
      }, this.reconnectInterval);
    }
  }

  async getDataTwiceAndConcat(options = {}) {
    const { isFirst = false, isSecond = false } = options;

    if (!this.isConnected) {
      throw new Error("Scanner connection not established");
    }

    return new Promise((resolve, reject) => {
      let data = "";
      let dataCount = 0;
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Scanner read timeout"));
      }, 10000); // 10 second timeout

      const dataHandler = (chunk) => {
        data += chunk.toString();
        dataCount++;

        if (dataCount === 2) {
          cleanup();
          const cleanedData = data.replace(/[\r\n]+/g, "").trim();
          logger.info(
            `Scanner data received (${isFirst ? "First" : isSecond ? "Second" : "Unknown"} scan): ${cleanedData}`
          );
          resolve(cleanedData);
        }
      };

      const errorHandler = (error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.client.removeListener("data", dataHandler);
        this.client.removeListener("error", errorHandler);
      };

      this.client.on("data", dataHandler);
      this.client.on("error", errorHandler);
    });
  }

  disconnect() {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.isConnected = false;
    this.pendingConnection = null;
  }
}

export const tcpClient = new TCPClient();

// (async () => {
//   const port = 5024; // Replace with your TCP port
//   const host = "192.168.3.147"; // Replace with your TCP host

//   try {
//     // Ensure a single instance of the client
//     await tcpClient.connect({ port, host });

//     console.log("Waiting for data from TCP server...");
//     const data = await tcpClient.getDataTwiceAndConcat();
//     console.log("Received data:", data);

//     // Process the data as needed
//   } catch (error) {
//     console.error("Error:", error.message);
//   } finally {
//     // Close the connection when done
//     tcpClient.disconnect();
//   }
// })();
