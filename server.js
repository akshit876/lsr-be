import { createServer } from "http";
import fs from "fs";
import morgan from "morgan";
import { Server } from "socket.io";
import logger from "./logger.js";
import {
  handleFirstScan,
  handleSecondScan,
  watchCodeFile,
} from "./services/serialPortService.js";
import { MockSerialPort } from "./services/mockSerialPort.js";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import { getCurrentDate } from "./services/scanUtils.js";
import {
  connect,
  readBit,
  readRegister,
  writeBit,
  writeRegister,
} from "./services/modbus.js";
import { manualRun } from "./services/manualRunService.js";
import mongoDbService from "./services/mongoDbService.js";
import { runContinuousScan } from "./services/testCycle.js";
import cronService from "./services/cronService.js";
import ShiftUtility from "./services/ShiftUtility.js";
import BufferedComPortService from "./services/ComPortService.js";
import BarcodeGenerator from "./services/barcodeGenrator.js";
import { MongoClient } from "mongodb";
import { scannerController } from "./services/scanCycles.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MODBUS_IP = process.env.MODBUS_IP;
const MODBUS_PORT = parseInt(process.env.MODBUS_PORT, 10);

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

    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
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

    return { partNumber, mainDataRecords: [] };
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

  // UI Scanner Trigger Event
  socket.on("scanner_trigger", async () => {
    try {
      logger.info(`Client ${socket.id} triggered scanner (1481.0)`);
      await writeBit(1481, 0, 1);
      logger.info("✅ Scanner trigger bit 1481.0 set to 1");
      socket.emit("scanner_trigger_success", {
        timestamp: new Date().toISOString(),
        register: 1481,
        bit: 0,
        value: 1,
      });
    } catch (error) {
      logger.error(`Error triggering scanner for client ${socket.id}:`, error);
      socket.emit("error", {
        message: "Failed to trigger scanner",
        details: error.message,
      });
    }
  });

  // Manual Mode Event
  socket.on("manual-mode", async (data) => {
    try {
      logger.info(`Client ${socket.id} activated manual mode (1483.0)`);
      await writeBit(1483, 0, data.mode === "on" ? 1 : 0);

      // Set speed if provided
      if (data.speed) {
        await writeRegister(1484, data.speed);
        logger.info(`✅ Manual mode speed set to ${data.speed}`);
      }

      logger.info(`✅ Manual mode ${data.mode} activated`);
      socket.emit("manual_mode_success", {
        timestamp: new Date().toISOString(),
        mode: data.mode,
        speed: data.speed || 100,
        register: 1483,
        bit: 0,
        value: data.mode === "on" ? 1 : 0,
      });
    } catch (error) {
      logger.error(
        `Error activating manual mode for client ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Failed to activate manual mode",
        details: error.message,
      });
    }
  });

  // Jog Forward Event
  socket.on("jog-forward", async (data) => {
    try {
      logger.info(`Client ${socket.id} activated jog forward (1485.0)`);
      await writeBit(1485, 0, 1);

      // Set jog speed if provided
      if (data.speed) {
        await writeRegister(1486, data.speed);
        logger.info(`✅ Jog forward speed set to ${data.speed}`);
      }

      logger.info("✅ Jog forward activated");
      socket.emit("jog_forward_success", {
        timestamp: new Date().toISOString(),
        direction: "forward",
        speed: data.speed || 50,
        register: 1485,
        bit: 0,
        value: 1,
      });
    } catch (error) {
      logger.error(
        `Error activating jog forward for client ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Failed to activate jog forward",
        details: error.message,
      });
    }
  });

  // Jog Reverse Event
  socket.on("jog-reverse", async (data) => {
    try {
      logger.info(`Client ${socket.id} activated jog reverse (1487.0)`);
      await writeBit(1487, 0, 1);

      // Set jog speed if provided
      if (data.speed) {
        await writeRegister(1488, data.speed);
        logger.info(`✅ Jog reverse speed set to ${data.speed}`);
      }

      logger.info("✅ Jog reverse activated");
      socket.emit("jog_reverse_success", {
        timestamp: new Date().toISOString(),
        direction: "reverse",
        speed: data.speed || 50,
        register: 1487,
        bit: 0,
        value: 1,
      });
    } catch (error) {
      logger.error(
        `Error activating jog reverse for client ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Failed to activate jog reverse",
        details: error.message,
      });
    }
  });

  // Jog Stop Event
  socket.on("jog-stop", async () => {
    try {
      logger.info(`Client ${socket.id} stopped jog operation`);

      // Stop both jog directions
      await writeBit(1485, 0, 0); // Stop forward
      await writeBit(1487, 0, 0); // Stop reverse

      logger.info("✅ Jog operation stopped");
      socket.emit("jog_stop_success", {
        timestamp: new Date().toISOString(),
        message: "Jog operation stopped",
        registers: [
          { register: 1485, bit: 0, value: 0 },
          { register: 1487, bit: 0, value: 0 },
        ],
      });
    } catch (error) {
      logger.error(`Error stopping jog for client ${socket.id}:`, error);
      socket.emit("error", {
        message: "Failed to stop jog operation",
        details: error.message,
      });
    }
  });

  // UI Mark On Event
  socket.on("mark_on", async () => {
    try {
      logger.info(`Client ${socket.id} triggered mark on (1480.0)`);
      await writeBit(1480, 0, 1);
      logger.info("✅ Mark on bit 1480.0 set to 1");
      socket.emit("mark_on_success", {
        timestamp: new Date().toISOString(),
        register: 1480,
        bit: 0,
        value: 1,
      });
    } catch (error) {
      logger.error(`Error triggering mark on for client ${socket.id}:`, error);
      socket.emit("error", {
        message: "Failed to trigger mark on",
        details: error.message,
      });
    }
  });

  // UI Light On Event
  socket.on("light_on", async () => {
    try {
      logger.info(`Client ${socket.id} triggered light on (1482.0)`);
      await writeBit(1482, 0, 1);
      logger.info("✅ Light on bit 1482.0 set to 1");
      socket.emit("light_on_success", {
        timestamp: new Date().toISOString(),
        register: 1482,
        bit: 0,
        value: 1,
      });
    } catch (error) {
      logger.error(`Error triggering light on for client ${socket.id}:`, error);
      socket.emit("error", {
        message: "Failed to trigger light on",
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

  // New event for paginated data (for smooth scroll UI with 500 records)
  socket.on("request-paginated-data", (requestData) => {
    const options = {
      limit: requestData?.limit || 500,
      skip: requestData?.skip || 0,
      modelNumber: requestData?.modelNumber || null,
      startDate: requestData?.startDate || null,
      endDate: requestData?.endDate || null,
      sortBy: requestData?.sortBy || "Timestamp",
      sortOrder: requestData?.sortOrder || -1,
      includeFields: requestData?.includeFields || null,
    };

    mongoDbService
      .sendPaginatedDataToClient(socket, "main-data", "records", options)
      .catch((error) => {
        console.error("Error in sendPaginatedDataToClient:", error);
        socket.emit("error", {
          message: "Failed to fetch paginated data",
          details: error.message,
        });
      });
  });

  // New event for getting recent records (real-time updates)
  socket.on("request-recent-records", (requestData) => {
    const limit = requestData?.limit || 50;
    const modelNumber = requestData?.modelNumber || null;

    mongoDbService
      .connect("main-data", "records")
      .then(() => mongoDbService.getRecentRecords(limit, modelNumber))
      .then((records) => {
        const transformedData = records.map((item) => ({
          _id: item._id,
          Timestamp: item?.Timestamp,
          SerialNumber: item?.SerialNumber,
          MarkingData: item?.MarkingData,
          ScannerData: item?.ScannerData,
          ModelNumber: item?.ModelNumber,
          User: item?.User,
          Grade: item?.Grade,
          CurrentId: item?.CurrentId,
          Shift: item?.Shift,
          Result: item?.Result,
          Date: item?.Date,
        }));

        socket.emit("recent-records", {
          data: transformedData,
          count: transformedData.length,
          timestamp: new Date().toISOString(),
        });
      })
      .catch((error) => {
        console.error("Error fetching recent records:", error);
        socket.emit("error", {
          message: "Failed to fetch recent records",
          details: error.message,
        });
      });
  });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, async (err) => {
  if (err) {
    emitErrorEvent(io, "server-start-failure", JSON.stringify(err));
    logger.error("Server failed to start: %s", err.message);
    throw err;
  }
  logger.info(`> Server ready on http://localhost:${PORT}`);

  let comService = null;
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
    //   path: 'COM3',s
    //   baudRate: 9600,
    //   logDir: 'com_port_logs',
    // });
    // await comService.initSerialPort();
    await connect();
    // Fetch part number and pass it to runContinuousScan
    const { partNumber, mainDataRecords } = await fetchPartNumberAndData();

    // runContinuousScan(io, null, { partNumber }).catch((error) => {
    //   logger.error('Failed to start continuous scan:', error);
    //   process.exit(1);
    // });
    await scannerController.runContinuousScan(io, null, { partNumber });
  } catch (error) {
    console.log({ error });
    emitErrorEvent(io, "modbus-connection-error", JSON.stringify(error));
    logger.error("Failed to initialize Modbus connection:", error);
    // await comService.closePort();
  }
});

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
