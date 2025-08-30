import { createServer } from "http";
import morgan from "morgan";
import { Server } from "socket.io";
import logger from "./logger.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import {
  connect,
  readBit,
  readRegister,
  writeBit,
  writeRegister,
} from "./services/modbus.js";
import mongoDbService from "./services/mongoDbService.js";
import cronService from "./services/cronService.js";
import { MongoClient } from "mongodb";
import { scannerController } from "./services/scanCycles.js";
import socketEventService from "./services/socketEventService.js";

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

  // UI Scanner Trigger Event - handled by SocketEventService
  socket.on("scanner_trigger", async () => {
    try {
      await socketEventService.handleScannerTrigger(socket);
    } catch (error) {
      logger.error(`Error in scanner_trigger handler:`, error);
    }
  });

  // UI Mark On Event - handled by SocketEventService
  socket.on("mark_on", async () => {
    try {
      await socketEventService.handleMarkOn(socket);
    } catch (error) {
      logger.error(`Error in mark_on handler:`, error);
    }
  });

  // UI Light On Event - handled by SocketEventService
  socket.on("light_on", async () => {
    try {
      await socketEventService.handleLightOn(socket);
    } catch (error) {
      logger.error(`Error in light_on handler:`, error);
    }
  });

  // Manual Run Event - handled by SocketEventService
  socket.on("manual-run", async (operation) => {
    try {
      await socketEventService.handleManualRun(socket, operation);
    } catch (error) {
      logger.error(`Error in manual-run handler:`, error);
    }
  });

  // Servo Setting Change Event - handled by SocketEventService
  socket.on("servo-setting-change", async (data) => {
    try {
      await socketEventService.handleServoSettingChange(socket, data);
    } catch (error) {
      logger.error(`Error in servo-setting-change handler:`, error);
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

  // Job Control Events - handled by SocketEventService
  socket.on("job-control", async ({ jobType, action }) => {
    try {
      await socketEventService.handleJobControl(socket, jobType, action);
    } catch (error) {
      logger.error(`Error in job-control handler:`, error);
    }
  });

  // Generic PLC Bit Operations - handled by SocketEventService
  socket.on("plc-bit-operation", async (data) => {
    try {
      await socketEventService.handlePlcBitOperation(socket, data);
    } catch (error) {
      logger.error(`Error in plc-bit-operation handler:`, error);
    }
  });

  // Generic PLC Register Operations - handled by SocketEventService
  socket.on("plc-register-operation", async (data) => {
    try {
      await socketEventService.handlePlcRegisterOperation(socket, data);
    } catch (error) {
      logger.error(`Error in plc-register-operation handler:`, error);
    }
  });

  // Get SocketEventService status
  socket.on("get-event-service-status", () => {
    try {
      const status = socketEventService.getStatus();
      socket.emit("event-service-status", status);
    } catch (error) {
      logger.error(`Error getting event service status:`, error);
      socket.emit("error", {
        message: "Failed to get event service status",
        details: error.message,
      });
    }
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

    // Initialize SocketEventService for parallel event handling
    await socketEventService.initialize();
    logger.info("SocketEventService initialized for parallel event handling");

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
    //   path: 'COM3',
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
