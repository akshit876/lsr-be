import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);

export const PATHS = {
  CODE_FILE: path.join(__dirname, "../../data/code.txt"),
  TEXT_FILE: path.join(__dirname, "../../data/text.txt"),
};

export const TIMEOUTS = {
  DEFAULT: 100 * 1000,
  RETRY_DELAY: 2000,
  RESET_DELAY: 1000,
};

export const BARCODE = {
  RESET_HOUR: 6,
  RESET_MINUTE: 0,
};

export const TCP_CONFIG = {
  PORT: 5024,
  HOST: "192.168.3.147",
};

export const REGISTERS = {
  START_SIGNAL: { register: 1400, bit: 0 },
  RESET_SIGNAL: { register: 1600, bit: 0 },
  FILE_TRANSFER: { register: 1414, bit: 15 },
  RESET_CONFIRM: { register: 1500, bit: 3 },
};

export const DB_CONFIG = {
  DEFAULT_URI: "mongodb://localhost:27017",
  DEFAULT_DB: "main-data",
  DEFAULT_COLLECTION: "records",
};
