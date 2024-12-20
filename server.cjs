// import { createServer } from "http";
// import { MongoClient } from "mongodb";
// import morgan from "morgan";
// import { dirname } from "path";
// import { Server } from "socket.io";
// import { fileURLToPath } from "url";
// import logger from "./logger.js";
// import BufferedComPortService from "./services/ComPortService.js";
// import cronService from "./services/cronService.js";
// import { manualRun } from "./services/manualRunService.js";
// import {
//   connect,
//   readBit,
//   readRegister,
//   writeBit,
//   writeRegister,
// } from "./services/modbus.js";
// import mongoDbService from "./services/mongoDbService.js";
// import { scannerController } from "./services/scanCycles.js";
// import serialNumberService from "./services/serialNumber.js";

const { createServer } = require("http");
const { MongoClient } = require("mongodb");
const morgan = require("morgan");
const { dirname } = require("path");
const { Server } = require("socket.io");
const { fileURLToPath } = require("url");
const logger = require("./logger.cjs");
// const BufferedComPortService = require("./services/ComPortService.cjs");
const cronService = require("./services/cronService.cjs");
const { manualRun } = require("./services/manualRunService.cjs");
const {
  connect,
  readBit,
  readRegister,
  writeBit,
  writeRegister,
} = require("./services/modbus.cjs");
const mongoDbService = require("./services/mongoDbService.cjs");
const { scannerController } = require("./services/scanCycles.cjs");
const serialNumberService = require("./services/serialNumber.cjs");

// const __filename = __filename;
// const __dirname = dirname(__filename);

// const REGISTER_MONITORING_CONFIG = {
//   register: 1490,
//   interval: 100, // ms
//   bits: {
//     0: {
//       eventName: "part-presence",
//       message: "Part not present.............",
//     },
//     1: {
//       eventName: "emergency-stop",
//       message: "Emergency button pressed.............",
//     },
//     2: {
//       eventName: "light-curtation",
//       message: "Light curtain error.............",
//     },
//     // 3: {
//     //   eventName: "emergency-stop-detected",
//     //   message: "Emergency stop signal detected",
//     // },
//   },
// };

const REGISTERS_TO_MONITOR = [
  {
    register: 1490,
    interval: 100,
    bits: {
      0: { eventName: "part-presence", message: "Part not present" },
      1: { eventName: "emergency-stop", message: "Emergency button pressed" },
      2: { eventName: "light-curtation", message: "Light curtain error" },
      // 3: { eventName: "servo-position", message: "Servo not home position" },
      // 4: { eventName: "reject-bin", message: "Put the part in the rejection bin" }
    },
  },
];

let registerMonitorInterval = null;

async function monitorRegisters(io) {
  const { register, interval, bits } = REGISTER_MONITORING_CONFIG;

  // Clear any existing interval
  if (registerMonitorInterval) {
    clearInterval(registerMonitorInterval);
  }

  registerMonitorInterval = setInterval(async () => {
    try {
      for (const [bit, config] of Object.entries(bits)) {
        const value = await readBit(register, parseInt(bit));
        console.log({ register, value });
        if (value) {
          io.emit(config.eventName, {
            register,
            bit: parseInt(bit),
            value,
            message: config.message,
            timestamp: new Date().toISOString(),
          });
          logger.info(`${config.message} (Register ${register}.${bit})`);
        }
      }
    } catch (error) {
      logger.error("Error monitoring registers:", error);
    }
  }, interval);

  return () => {
    if (registerMonitorInterval) {
      clearInterval(registerMonitorInterval);
      registerMonitorInterval = null;
      logger.info("Register monitoring stopped");
    }
  };
}

// module.exports = {
//   REGISTERS_TO_MONITOR,
//   fetchPartNumberAndData,
// };

const MODBUS_IP = process.env.MODBUS_IP;
const MODBUS_PORT = parseInt(process.env.MODBUS_PORT, 10);

const BARCODE_RESET_HOUR = 6;
const BARCODE_RESET_MINUTE = 0;

// import { exec } from "child_process";
// import util from "util";
// import config from "./config/config.js";
const exec = require("child_process").exec;
const util = require("util");
const config = require("./config/config.cjs");
const execAsync = util.promisify(exec);

// Function to kill process using port 3002
async function killProcessOnPorts(ports) {
  for (const port of ports) {
    try {
      // For Windows
      if (process.platform === "win32") {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const lines = stdout.split("\n");
        const line = lines.find((l) => l.includes(":" + port));
        if (line) {
          const pid = line.trim().split(/\s+/).pop();
          await execAsync(`taskkill /F /PID ${pid}`);
          console.log(`Process using port ${port} has been killed`);
        }
      } else {
        // For Linux/Mac
        await execAsync(
          `lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs kill -9`
        );
        console.log(`Process using port ${port} has been killed`);
      }
    } catch (error) {
      console.log(
        `No process found using port ${port} or error killing process:`,
        error.message
      );
    }
  }
}

console.log({ MODBUS_IP, MODBUS_PORT });

function emitErrorEvent(socket, errorType, errorMessage) {
  if (socket) {
    socket.emit("error", {
      type: errorType,
      message: errorMessage,
    });
  }
  logger.error(`${errorType}: ${errorMessage}`);
}

function floatToInt(value, isSpeed = false) {
  if (isSpeed) {
    return Math.round(parseFloat(value));
  } else {
    return Math.round(parseFloat(value) * 100);
  }
}

const server = createServer((req, res) => {
  morgan("combined", {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })(req, res, (err) => {
    if (err) {
      res.statusCode = 500;
      res.end("Internal Server Error");
      return;
    }

    // Handle static files and simple routing here
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Welcome to the Node.js Server</h1>");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    }
  });
});
async function fetchPartNumberAndData() {
  try {
    // Connect to the MongoDB if not already connected

    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db("main-data");
    // console.log({ db });
    const collection = db.collection("config");
    logger.info("Connected successfully to MongoDB database: main-data");

    // Fetch part number from the 'configs' collection
    const configData = await collection.findOne({});
    // console.log({ configData });
    const partNumber = configData?.partNo || "Unknown Part No"; // Default value if part no is not found

    // Fetch records from 'main-data' collection (or any other collection as needed)
    // const mainDataRecords = await mongoDbService.collection.find({}).toArray();

    logger.info(`Fetched part number: ${partNumber} and main data records`);

    return { partNumber, configData };
  } catch (error) {
    logger.error("Error fetching part number or data:", error);
    throw error;
  }
}

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Your frontend URL
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  let intervalId = null;
  let lightTimeoutId = null;
  let scannerTimeoutId = null;
  let markTimeoutId = null;
  logger.info(`New client connected: ${socket.id}`);

  socket.on("request-csv-data", () => {
    mongoDbService
      .sendMongoDbDataToClient(socket, "main-data", "records")
      .catch((error) => {
        console.error("Error in sendMongoDbDataToClient:", error);
      });
  });

  socket.on(
    "request-modbus-data",
    async ({ register, bits, interval = 1000 }) => {
      if (intervalId) {
        clearInterval(intervalId);
      }

      await sendModbusDataToClientBits(socket, register, bits);
    }
  );

  socket.on("stop-modbus-data", () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  });

  socket.on("disconnect", () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
    if (lightTimeoutId) {
      clearTimeout(lightTimeoutId);
    }
    if (scannerTimeoutId) {
      clearTimeout(scannerTimeoutId);
    }
    if (markTimeoutId) {
      clearTimeout(markTimeoutId);
    }
    logger.info(`Client disconnected: ${socket.id}`);
  });

  socket.on("write-modbus-register", async ({ address, bit, value }) => {
    try {
      await writeModbusBit(address, bit, value);
      logger.info(
        `Client ${socket.id} wrote value ${value} to register ${address}, bit ${bit}`
      );
      socket.emit("writeSuccess", { address, bit, value });
    } catch (error) {
      logger.error(`Error writing to register for client ${socket.id}:`, error);
      socket.emit("error", {
        message: "Failed to write to register",
        details: error.message,
      });
    }
  });

  socket.on("manual-run", async (operation) => {
    try {
      const result = await manualRun(operation);
      logger.info(`Client ${socket.id} triggered manual run: ${operation}`);
      socket.emit("manualRunSuccess", { operation, result });
    } catch (error) {
      logger.error(
        `Error executing manual run for client ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Failed to execute manual run",
        details: error.message,
      });
    }
  });

  socket.on("servo-setting-change", async (data) => {
    try {
      const { setting, value } = data;
      let register;
      let intValue;

      switch (setting) {
        case "homePosition":
          if (value.position !== undefined) {
            register = 550;
            intValue = floatToInt(value.position);
          } else {
            register = 560;
            intValue = floatToInt(value.speed, true);
          }
          break;
        case "scannerPosition":
          if (value.position !== undefined) {
            register = 552;
            intValue = floatToInt(value.position);
          } else {
            register = 562;
            intValue = floatToInt(value.speed, true);
          }
          break;
        case "ocrPosition":
          if (value.position !== undefined) {
            register = 554;
            intValue = floatToInt(value.position);
          } else {
            register = 564;
            intValue = floatToInt(value.speed, true);
          }
          break;
        case "markPosition":
          if (value.position !== undefined) {
            register = 556;
            intValue = floatToInt(value.position);
          } else {
            register = 566;
            intValue = floatToInt(value.speed, true);
          }
          break;
        case "fwdEndLimit":
          register = 574;
          intValue = floatToInt(value.position);
          break;
        case "revEndLimit":
          register = 578;
          intValue = floatToInt(value.position);
          break;
        default:
          throw new Error("Invalid setting");
      }

      await writeRegister(register, intValue);
      logger.info(
        `Client ${socket.id} updated ${setting} to ${JSON.stringify(
          value
        )} (written as ${intValue})`
      );

      socket.emit("servo-setting-change-response", {
        success: true,
        setting,
      });
    } catch (error) {
      logger.error(
        `Error updating servo setting for client ${socket.id}:`,
        error
      );
      socket.emit("servo-setting-change-response", {
        success: false,
        setting: data.setting,
        message: error.message,
      });
    }
  });

  // Handle scanner trigger event
  socket.on("scanner_trigger", async () => {
    try {
      logger.info("Received scanner trigger request");
      await writeBit(1481, 0, 1);

      // Clear any existing timeout
      if (scannerTimeoutId) {
        clearTimeout(scannerTimeoutId);
      }

      // Set new timeout to clear the bit after 300ms
      scannerTimeoutId = setTimeout(async () => {
        try {
          await writeBit(1481, 0, 0);
          logger.info("Scanner trigger bit cleared after timeout");
          scannerTimeoutId = null;
        } catch (error) {
          logger.error("Error clearing scanner trigger bit:", error);
        }
      }, 300);

      socket.emit("scanner_trigger_response", {
        success: true,
        message: "Scanner triggered successfully",
      });
    } catch (error) {
      logger.error("Error triggering scanner:", error);
      socket.emit("scanner_trigger_response", {
        success: false,
        message: error.message,
      });
    }
  });

  // Handle mark on event
  socket.on("mark_on", async () => {
    try {
      logger.info("Received mark on request");
      await writeBit(1480, 0, 1);

      // Clear any existing timeout
      if (markTimeoutId) {
        clearTimeout(markTimeoutId);
      }

      // Set new timeout to clear the bit after 300ms
      markTimeoutId = setTimeout(async () => {
        try {
          await writeBit(1480, 0, 0);
          logger.info("Mark on bit cleared after timeout");
          markTimeoutId = null;
        } catch (error) {
          logger.error("Error clearing mark on bit:", error);
        }
      }, 300);

      socket.emit("mark_on_response", {
        success: true,
        message: "Mark on triggered successfully",
      });
    } catch (error) {
      logger.error("Error triggering mark on:", error);
      socket.emit("mark_on_response", {
        success: false,
        message: error.message,
      });
    }
  });

  // Handle LIGHT on event
  socket.on("light_on", async () => {
    try {
      logger.info("Received LIGHT on request");
      await writeBit(1482, 0, 1);

      // Clear any existing timeout
      if (lightTimeoutId) {
        clearTimeout(lightTimeoutId);
      }

      // Set new timeout to clear the bit after 200ms
      lightTimeoutId = setTimeout(async () => {
        try {
          await writeBit(1482, 0, 0);
          logger.info("LIGHT bit cleared after timeout");
          lightTimeoutId = null;
        } catch (error) {
          logger.error("Error clearing LIGHT bit:", error);
        }
      }, 200);

      socket.emit("LIGHT_on_response", {
        success: true,
        message: "LIGHT on triggered successfully",
      });
    } catch (error) {
      logger.error("Error triggering LIGHT on:", error);
      socket.emit("LIGHT_on_response", {
        success: false,
        message: error.message,
      });
    }
  });

  socket.on("triggerManualReset", async (serialConfig) => {
    try {
      logger.info(
        "🔄 Manual serial number reset triggered with config:",
        serialConfig
      );

      // Pass the resetValue from frontend to the manualSerialNumberReset method
      const result = await serialNumberService.manualSerialNumberReset(
        serialConfig.resetValue
      );

      socket.emit("resetComplete", {
        success: true,
        currentValue: result.currentValue,
        resetTime: result.resetTime,
        resetValue: serialConfig.resetValue,
        initialValue: serialConfig.initialValue,
        resetInterval: serialConfig.resetInterval,
      });

      logger.success(
        `Serial number reset to ${result.currentValue} with reset value ${serialConfig.resetValue}`
      );
    } catch (error) {
      logger.error("❌ Error during manual reset:", error);
      socket.emit("resetComplete", {
        success: false,
        error: error.message,
      });
    }
  });

  // Handle reset time update
  socket.on("updateResetTime", async (resetTimeConfig) => {
    try {
      logger.info(
        "🕒 Serial number reset time update triggered with config:",
        resetTimeConfig
      );

      // Validate input
      const hour = parseInt(resetTimeConfig.hour);
      const minute = parseInt(resetTimeConfig.minute);

      if (isNaN(hour) || hour < 0 || hour > 23) {
        throw new Error("Invalid hour. Must be between 0 and 23");
      }
      if (isNaN(minute) || minute < 0 || minute > 59) {
        throw new Error("Invalid minute. Must be between 0 and 59");
      }

      // Update reset time in the scanner controller
      await scannerController.updateResetTime(hour, minute);

      socket.emit("resetTimeComplete", {
        success: true,
        hour: hour,
        minute: minute,
        message: `Reset time updated to ${hour}:${minute.toString().padStart(2, "0")}`,
      });

      logger.success(
        `Serial number reset time updated to ${hour}:${minute.toString().padStart(2, "0")}`
      );
    } catch (error) {
      logger.error("❌ Error updating reset time:", error);
      socket.emit("resetTimeComplete", {
        success: false,
        error: error.message,
      });
    }
  });
});

const PORT = process.env.PORT || 3002;
const PORTS = [3000, 3002];

// Add error handling for the server
const startServer = async () => {
  try {
    await killProcessOnPorts(PORTS);

    // Wait a moment for the port to be released
    await new Promise((resolve) => setTimeout(resolve, 1000));

    server.listen(PORT, async (err) => {
      if (err) {
        emitErrorEvent(io, "server-start-failure", JSON.stringify(err));
        logger.error("Server failed to start: %s", err.message);
        throw err;
      }
      logger.info(`> Server ready on http://localhost:${PORT}`);

      let comService = null;
      const cleanupMonitoring = null;
      try {
        await connect();
        logger.info("Modbus connection initialized");

        cronService.scheduleJob(
          "monthlyExport",
          "1 0 1 * *",
          cronService.generateMonthlyCsv.bind(cronService)
        );
        cronService.startAllJobs();

        // const shiftUtility = new ShiftUtility();
        // const barcodeGenerator = new BarcodeGenerator(shiftUtility);
        // barcodeGenerator.initialize('main-data', 'records');
        // barcodeGenerator.setResetTime(BARCODE_RESET_HOUR, BARCODE_RESET_MINUTE);
        // comService = new BufferedComPortService({
        //   path: config.serial_port,
        //   baudRate: 9600,
        //   logDir: "com_port_logs",
        // });
        // await comService.initSerialPort();
        // await connect();
        // Fetch part number and pass it to runContinuousScan
        const { partNumber } = await fetchPartNumberAndData();

        // Start both processes in parallel using Promise.all
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 5000; // 5 seconds

        async function startProcessWithRetry(
          processFunc,
          processName,
          retryCount = 0
        ) {
          try {
            return await processFunc();
          } catch (error) {
            logger.error(`${processName} error:`, error);

            if (retryCount < MAX_RETRIES) {
              logger.info(
                `Retrying ${processName} in ${RETRY_DELAY / 1000} seconds... (Attempt ${retryCount + 1}/${MAX_RETRIES})`
              );
              await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
              return startProcessWithRetry(
                processFunc,
                processName,
                retryCount + 1
              );
            } else {
              logger.error(
                `${processName} failed after ${MAX_RETRIES} attempts`
              );
              throw error; // Finally throw the error after max retries
            }
          }
        }

        Promise.all([
          // Process 1: Monitor registers with retry
          // startProcessWithRetry(
          //   () => monitorRegisters(io),
          //   "Register monitoring"
          // ),

          // Process 2: Run continuous scan with retry
          startProcessWithRetry(
            () =>
              scannerController.runContinuousScan(io, comService, {
                partNumber,
              }),
            "Scanner controller"
          ),
        ])
          .then(() => {
            logger.info("Both processes started successfully");
          })
          .catch((error) => {
            logger.error("Critical error in parallel processes:", error);
            // Optionally restart the entire server or take other recovery actions
            process.exit(1); // Force restart if using a process manager
          });
      } catch (error) {
        console.log({ error });
        emitErrorEvent(io, "modbus-connection-error", JSON.stringify(error));
        logger.error("Failed to initialize Modbus connection:", error);
        // await comService.closePort();
      }
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

server.on("error", (err) => {
  console.log({ err });
  logger.error("Server error: %s", err.message);
});

server.on("close", () => {
  logger.info("Server closed");
});

async function sendModbusDataToClient(socket, readRange) {
  try {
    const [start, length] = readRange;
    logger.info(
      `Client ${socket.id} requested read: start=${start}, length=${length}`
    );

    const registers = await readRegister(start, length - start + 1);

    logger.info(
      `Read successful for client ${socket.id}: ${JSON.stringify(registers)}`
    );
    socket.emit("modbus-data", { registers });
  } catch (error) {
    logger.error(`Error reading registers for client ${socket.id}:`, error);
    socket.emit("error", {
      message: "Failed to read registers",
      details: error.message,
    });
  }
}

async function writeModbusBit(address, bit, value) {
  await writeBit(address, bit, value);
}

async function sendModbusDataToClientBits(socket, register, bits) {
  try {
    const [registerValue] = await readRegister(register, 1);
    const bitValues = {};

    for (const bit of bits) {
      bitValues[bit] = await readBit(register, bit);
    }

    socket.emit("modbus-data", {
      register,
      value: registerValue,
      bits: bitValues,
    });
  } catch (error) {
    logger.error(`Error reading register for client ${socket.id}:`, error);
    emitErrorEvent(io, "register-read-failure", "Failed to read register");
  }
}

process.on("SIGINT", async () => {
  logger.info("Received SIGINT. Closing MongoDB connection and exiting...");
  await mongoDbService.disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM. Closing MongoDB connection and exiting...");
  await mongoDbService.disconnect();
  process.exit(0);
});

startServer();
