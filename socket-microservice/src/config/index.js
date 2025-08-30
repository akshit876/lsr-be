import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.SOCKET_SERVICE_PORT || "3003", 10),
    host: process.env.SOCKET_SERVICE_HOST || "0.0.0.0",
    environment: process.env.NODE_ENV || "development",
  },

  modbus: {
    ip:
      process.env.NEXT_PUBLIC_MODBUS_IP ||
      process.env.MODBUS_IP ||
      "192.168.3.146",
    port: parseInt(
      process.env.NEXT_PUBLIC_MODBUS_PORT || process.env.MODBUS_PORT || "502",
      10
    ),
    timeout: parseInt(process.env.MODBUS_TIMEOUT || "5000", 10),
    retries: parseInt(process.env.MODBUS_RETRIES || "3", 10),
  },

  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "json",
    file: process.env.LOG_FILE || "./logs/socket-service.log",
  },

  security: {
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10), // limit each IP to 100 requests per windowMs
    },
    helmet: {
      enabled: process.env.HELMET_ENABLED !== "false",
    },
  },

  health: {
    checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || "30000", 10), // 30 seconds
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || "5000", 10), // 5 seconds
  },

  plc: {
    registers: {
      scannerTrigger: {
        address: 1481,
        bit: 0,
      },
      markOn: {
        address: 1480,
        bit: 0,
      },
      lightOn: {
        address: 1482,
        bit: 0,
      },
      servo: {
        homePosition: { address: 550, speedAddress: 560 },
        scannerPosition: { address: 552, speedAddress: 562 },
        ocrPosition: { address: 554, speedAddress: 564 },
        markPosition: { address: 556, speedAddress: 566 },
        fwdEndLimit: { address: 574 },
        revEndLimit: { address: 578 },
      },
    },
  },
};

// Validation
if (!config.modbus.ip) {
  throw new Error("MODBUS_IP environment variable is required");
}

if (!config.modbus.port) {
  throw new Error("MODBUS_PORT environment variable is required");
}

export default config;
