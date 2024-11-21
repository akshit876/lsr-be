import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path, { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, "../.env") });

/***
 * mongodb://localhost:27017/
 */
const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
  },

  mongodb: {
    url: process.env.MONGODB_URL || "mongodb://localhost:27017",
    database: process.env.MONGODB_DATABASE || "main-data",
    collection: process.env.MONGODB_COLLECTION || "records",
  },

  scanner: {
    barcodeResetHour: parseInt(process.env.BARCODE_RESET_HOUR || "6", 10),
    barcodeResetMinute: parseInt(process.env.BARCODE_RESET_MINUTE || "0", 10),
    scanTimeout: parseInt(process.env.SCAN_TIMEOUT || "100000", 10),
    codeFilePath: process.env.CODE_FILE_PATH || "./data/code.txt",
  },

  modbus: {
    host: process.env.MODBUS_HOST || "192.168.3.146",
    port: parseInt(process.env.MODBUS_PORT || "502", 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
  },

  serial_port: process.env.SERIAL_PORT || "COM5",
};

export default config;
