import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path, { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, "../.env") });

/**
 * Avoid Windows "localhost" → ::1 flakiness; keep mongodb+srv unchanged.
 */
function normalizeMongoUrl(url) {
  const raw =
    url ||
    process.env.MONGODB_URL ||
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017";
  const s = String(raw).trim();
  if (/^mongodb\+srv:/i.test(s)) return s;
  return s.replace(/mongodb:\/\/localhost(?=:|\/|$)/gi, "mongodb://127.0.0.1");
}

/**
 * Standalone local Mongo: directConnection avoids replica-set discovery delays.
 */
function withLocalMongoQueryParams(url) {
  if (/^mongodb\+srv:/i.test(url)) return url;
  if (/directConnection=/i.test(url)) return url;
  if (!/^mongodb:\/\/127\.0\.0\.1(?=:|\/|$)/i.test(url)) return url;
  return url.includes("?") ? `${url}&directConnection=true` : `${url}?directConnection=true`;
}

const mongodbUrl = withLocalMongoQueryParams(normalizeMongoUrl());

/***
 * Default: mongodb://127.0.0.1:27017 (see normalizeMongoUrl)
 */
const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
  },

  mongodb: {
    url: mongodbUrl,
    /** Passed to MongoClient — longer waits help when the Windows service is slow to listen */
    clientOptions: {
      family: 4,
      serverSelectionTimeoutMS: 60_000,
      connectTimeoutMS: 30_000,
      socketTimeoutMS: 120_000,
      retryWrites: true,
      retryReads: true,
      /** Lower on 16GB RAM if many apps hit MongoDB (default 20) — set MONGODB_MAX_POOL_SIZE */
      maxPoolSize: Math.max(
        1,
        Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE || "20", 10) || 20
      ),
      minPoolSize: 0,
      heartbeatFrequencyMS: 10_000,
    },
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
