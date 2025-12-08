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
import serialNumberService from "./services/serialNumber.js";
import { scannerController } from "./services/scanCycles.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define register sets to monitor
export const REGISTERS_TO_MONITOR = [
  {
    register: 1490,
    bits: {
      0: { eventName: "part-present", message: "Part not present" },
      1: {
        eventName: "emergency-button",
        message: "Emergency push button pressed",
      },
      2: { eventName: "safety-curtain", message: "Safety curtain error" },
      3: { eventName: "servo-position", message: "Servo not home position" },
      4: {
        eventName: "reject-bin",
        message: "Put the part in the rejection bin",
      },
    },
  },
  {
    register: 1600,
    bits: {
      9: {
        eventName: "ftp",
        message: "Image not getting saved , please run ftp server",
      },
    },
  },
  {
    register: 1700,
    bits: {
      1: {
        eventName: "reject-bin",
        message: "Put the part in the rejection bin",
      },
      2: {
        eventName: "tap-missing1",
        message: "Tap missing 1...",
      },
      3: {
        eventName: "tap-missing2",
        message: "Tap missing 2...",
      },
      4: {
        eventName: "tap-missing3",
        message: "Tap missing 3...",
      },
      5: {
        eventName: "tap-missing4",
        message: "Tap missing 4...",
      },
      6: {
        eventName: "tap-missing5",
        message: "Tap missing 5...",
      },
      7: {
        eventName: "tap-missing6",
        message: "Tap missing 6...",
      },
      8: {
        eventName: "tap-missing7",
        message: "Tap missing 7...",
      },
      9: {
        eventName: "tap-missing8",
        message: "Tap missing 8...",
      },
    },
  },
];

// Single function to monitor one register
async function monitorRegister(io, { register, bits }) {
  while (true) {
    try {
      for (const [bit, config] of Object.entries(bits)) {
        const value = await readBit(register, parseInt(bit));
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
      logger.error(`Error monitoring register ${register}:`, error);
    }
    const REGISTER_POLLING_INTERVAL = 100; // ms delay between register polls
    await new Promise((resolve) =>
      setTimeout(resolve, REGISTER_POLLING_INTERVAL)
    );
  }
}

const MODBUS_IP = process.env.MODBUS_IP;
const MODBUS_PORT = parseInt(process.env.MODBUS_PORT, 10);

const BARCODE_RESET_HOUR = 6;
const BARCODE_RESET_MINUTE = 0;

import { exec } from "child_process";
import util from "util";
import config from "./config/config.js";
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

export async function fetchPartNumberAndData() {
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

  // Guard: ensure cycle idle (1410.0 == 0) before writing trigger bits
  async function ensureCycleIdleOrWarn(actionLabel) {
    try {
      const isRunning = await readBit(1410, 0, false);
      if (isRunning) {
        logger.error(`❌ ${actionLabel} blocked: cycle already running (1410.0 == 1)`);
        return false;
      }
      return true;
    } catch (e) {
      logger.error(`❌ ${actionLabel} check failed for 1410.0: ${e?.message || e}`);
      return false;
    }
  }

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
      if (!(await ensureCycleIdleOrWarn("Scanner trigger"))) return;
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

  // Manual Mode Enter Event
  socket.on("manual_mode_enter", async (data) => {
    try {
      logger.info(`Client ${socket.id} entered manual mode:`, data);
      socket.emit("manual_mode_enter_success", {
        timestamp: new Date().toISOString(),
        message: "Manual mode entered successfully",
      });
    } catch (error) {
      logger.error(
        `Error entering manual mode for client ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Failed to enter manual mode",
        details: error.message,
      });
    }
  });

  // Manual Control Event (for main control buttons)
  socket.on("manual_control", async (data) => {
    try {
      const { type, register, bit, description } = data;
      logger.info(
        `Client ${socket.id} manual control: ${type} (${register}.${bit}) - ${description}`
      );

      // Handle different control types
      let targetRegister;
      switch (type) {
        case "HOME":
          targetRegister = 1480;
          break;
        case "LOGO":
          targetRegister = 1481;
          break;
        case "CODE":
          targetRegister = 1482;
          break;
        case "CASTING_TRACEABILITY":
          targetRegister = 1483;
          break;
        case "HUMAN_READABLE":
          targetRegister = 1484;
          break;
        case "SCANNER":
          targetRegister = 1485;
          break;
        case "SCANNER_TRIGGER":
          targetRegister = 1486;
          break;
        case "MARKON":
          targetRegister = 1487;
          break;
        case "LIGHT":
          targetRegister = 1488;
          break;
        default:
          throw new Error(`Unknown control type: ${type}`);
      }

      // Only guard UI-triggered cycle actions: marking/scanner/light groups
      if (
        ["SCANNER", "SCANNER_TRIGGER", "MARKON", "LIGHT"].includes(type)
      ) {
        if (!(await ensureCycleIdleOrWarn(`Manual control ${type}`))) return;
      }

      // Turn on the bit
      await writeBit(targetRegister, 0, 1);
      logger.info(
        `✅ Manual control ${type} activated on register ${targetRegister}`
      );

      // Auto-reset after 1 second
      setTimeout(async () => {
        try {
          await writeBit(targetRegister, 0, 0);
          logger.info(
            `🔄 Auto-reset: ${type} bit ${targetRegister}.0 set to 0`
          );
        } catch (resetError) {
          logger.error(`❌ Auto-reset failed for ${type}:`, resetError);
        }
      }, 1000);

      socket.emit("manual_control_success", {
        timestamp: new Date().toISOString(),
        type,
        register,
        bit,
        description,
        value: 1,
        autoReset: true,
        resetDelay: 1000,
      });
    } catch (error) {
      logger.error(
        `Error executing manual control for client ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Failed to execute manual control",
        details: error.message,
      });
    }
  });

  // Jog Control Event (for movement controls)
  socket.on("jog_control", async (data) => {
    try {
      const { type, action, register, bit, description } = data;
      logger.info(
        `Client ${socket.id} jog control: ${type} (${register}.${bit}) - ${description} - ${action}`
      );

      // Handle different jog types
      switch (type) {
        case "X_JOG_PLUS":
          await writeBit(1490, 0, action === "start" ? 1 : 0); // Example register
          break;
        case "X_JOG_MINUS":
          await writeBit(1491, 0, action === "start" ? 1 : 0); // Example register
          break;
        case "Z_JOG_PLUS":
          await writeBit(1492, 0, action === "start" ? 1 : 0); // Example register
          break;
        case "Z_JOG_MINUS":
          await writeBit(1493, 0, action === "start" ? 1 : 0); // Example register
          break;
        default:
          throw new Error(`Unknown jog type: ${type}`);
      }

      logger.info(`✅ Jog control ${type} ${action} executed`);
      socket.emit("jog_control_success", {
        timestamp: new Date().toISOString(),
        type,
        register,
        bit,
        description,
        action,
        value: action === "start" ? 1 : 0,
      });
    } catch (error) {
      logger.error(
        `Error executing jog control for client ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Failed to execute jog control",
        details: error.message,
      });
    }
  });

  // Emergency Stop Event
  socket.on("emergency_stop", async () => {
    try {
      logger.info(`Client ${socket.id} triggered emergency stop`);

      // Emergency stop logic - stop all operations
      await writeBit(1499, 0, 1); // Emergency stop bit

      logger.info("✅ Emergency stop executed");
      socket.emit("emergency_stop_success", {
        timestamp: new Date().toISOString(),
        message: "Emergency stop executed successfully",
        register: 1499,
        bit: 0,
        value: 1,
      });
    } catch (error) {
      logger.error(
        `Error executing emergency stop for client ${socket.id}:`,
        error
      );
      socket.emit("error", {
        message: "Failed to execute emergency stop",
        details: error.message,
      });
    }
  });

  // UI Mark On Event
  socket.on("mark_on", async () => {
    try {
      if (!(await ensureCycleIdleOrWarn("Mark on"))) return;
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
      if (!(await ensureCycleIdleOrWarn("Light on"))) return;
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

  // Handle scanner trigger event
  socket.on("scanner_trigger", async () => {
    try {
      logger.info("Received scanner trigger request");
      await writeBit(1414, 1, 1);

      // Clear any existing timeout
      if (scannerTimeoutId) {
        clearTimeout(scannerTimeoutId);
      }

      // Set new timeout to clear the bit after 300ms
      scannerTimeoutId = setTimeout(async () => {
        try {
          await writeBit(1414, 1, 0);
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
      await writeBit(1414, 0, 1);

      // Clear any existing timeout
      if (markTimeoutId) {
        clearTimeout(markTimeoutId);
      }

      // Set new timeout to clear the bit after 300ms
      markTimeoutId = setTimeout(async () => {
        try {
          await writeBit(1414, 0, 0);
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
      await writeBit(1414, 3, 1);

      // Clear any existing timeout
      if (lightTimeoutId) {
        clearTimeout(lightTimeoutId);
      }

      // Set new timeout to clear the bit after 200ms
      lightTimeoutId = setTimeout(async () => {
        try {
          await writeBit(1414, 3, 0);
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

  // Handle OCR data from supervisor
  socket.on("ocr_data", async ({ data }) => {
    try {
      if (!data || typeof data !== "string") {
        throw new Error("Invalid OCR data. Expected a non-empty string.");
      }

      const trimmedData = data.trim();
      if (trimmedData.length === 0) {
        throw new Error("OCR data cannot be empty.");
      }

      logger.info("📝 Received OCR data from supervisor:", trimmedData);

      // Store the OCR data in scanner controller for use in handleSecondScan
      scannerController.setPendingOcrData(trimmedData);

      socket.emit("ocr_data_response", {
        success: true,
        message: "OCR data received and will be used for next scan",
      });

      logger.success("OCR data stored successfully for next scan cycle");
    } catch (error) {
      logger.error("❌ Error handling OCR data:", error);
      socket.emit("ocr_data_response", {
        success: false,
        message: error.message,
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

      const comService = null;
      const cleanupMonitoring = null;
      try {
        await connect();
        logger.info("Modbus connection initialized");

        cronService.scheduleJob(
          "dailyExport",
          "0 6 * * *", // Runs at 6:00 AM every day
          cronService.generateDailyCsv.bind(cronService)
        );
        cronService.startAllJobs();

        // Fetch part number and pass it to runContinuousScan
        const { partNumber } = await fetchPartNumberAndData();

        // Start all monitoring processes
        const monitoringTasks = REGISTERS_TO_MONITOR.map((config) =>
          monitorRegister(io, config)
        );

        // Run everything in parallel
        Promise.all([
          ...monitoringTasks,
          scannerController.runContinuousScan(io, null, { partNumber }),
        ]).catch((error) => {
          logger.error("Error in monitoring processes:", error);
        });
      } catch (error) {
        console.log({ error });
        emitErrorEvent(io, "modbus-connection-error", JSON.stringify(error));
        logger.error("Failed to initialize:", error);
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
