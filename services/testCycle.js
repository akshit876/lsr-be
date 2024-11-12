const { fileURLToPath } = require("url");
const logger = require("../logger.js");
const {
  connect,
  readBit,
  readRegister,
  writeBit,
  writeBitsWithRest,
  writeRegister,
  writeRegisterFull,
} = require("./modbus.js");
// const { waitForBitToBecomeOne } = require("./serialPortService.js");

const { format } = require("date-fns");
const fs = require("fs");
const path = require("path");
const ComPortService = require("./ComPortService.js");
const ShiftUtility = require("./ShiftUtility.js");
const BarcodeGenerator = require("./barcodeGenrator.js");
const mongoDbService = require("./mongoDbService.js");
const BufferedComPortService = require("./ComPortService.js");
const EventEmitter = require("events");
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("worker_threads");
const { promisify } = require("util");

const __filename = fileURLToPath(__filename);
const __dirname = path.dirname(__filename);

let comPort;

const initializeComPort = () => {
  if (!comPort) {
    comPort = new ComPortService();
  }
  return comPort;
};

async function saveToMongoDB({
  io,
  serialNumber,
  markingData,
  scannerData,
  result,
}) {
  const now = new Date();
  const timestamp = format(now, "yyyy-MM-dd HH:mm:ss");

  const data = {
    Timestamp: new Date(timestamp),
    SerialNumber: serialNumber,
    MarkingData: markingData,
    ScannerData: scannerData,
    Result: result ? "OK" : "NG",
  };

  try {
    // Save to MongoDB
    await mongoDbService.insertRecord(data);
    logger.info("Data saved to MongoDB");

    if (io) {
      mongoDbService.sendMongoDbDataToClient(io, "main-data", "records");
    }
  } catch (error) {
    console.error({ error });
    logger.error("Error saving data:", error);
    throw error;
  }
}

const CODE_FILE_PATH = path.join(__dirname, "../data/code.txt");

async function writeOCRDataToFile(ocrDataString) {
  try {
    await clearCodeFile(CODE_FILE_PATH); // Clear the file before writing new data
    fs.writeFileSync(CODE_FILE_PATH, ocrDataString, "utf8");
    logger.info("OCR data written to code.txt");
  } catch (error) {
    logger.error(`Error writing OCR data to file: ${error.message}`);
    throw error;
  }
}

async function verifyWriteOperation(expectedData) {
  try {
    const actualData = await fs.readFile(CODE_FILE_PATH, "utf8");
    return actualData === expectedData;
  } catch (error) {
    logger.error(
      `Error reading OCR data from file for verification: ${error.message}`
    );
    return false;
  }
}

async function verifyAndRetryWrite(expectedData, retriesLeft) {
  for (let attempt = 1; attempt <= retriesLeft + 1; attempt++) {
    const actualData = await fs.readFileSync(CODE_FILE_PATH, "utf8");
    if (actualData === expectedData) {
      return true; // Data verified successfully
    }

    if (attempt <= retriesLeft) {
      logger.warn(
        `Verification attempt ${attempt} failed. Retrying write operation...`
      );
      await fs.writeFileSync(CODE_FILE_PATH, expectedData, "utf8");
    }
  }

  return false; // Verification failed after all retries
}
/**
 * Clears the contents of 'code.txt'.
 */
async function clearCodeFile(path) {
  try {
    fs.writeFileSync(path, "", "utf8"); // Overwrite with an empty string
    logger.info("Code file cleared.");
  } catch (error) {
    logger.error(`Error clearing code file: ${error.message}`);
    throw error;
  }
}

/**
 * Compares the scanner data with the contents of 'code.txt'.
 * @param {string} scannerData - The scanner data to compare.
 * @returns {boolean} - True if the data matches, otherwise false.
 */
async function compareScannerDataWithCode(scannerData) {
  try {
    const codeData = fs.readFileSync(CODE_FILE_PATH, "utf8").trim();
    const isMatch = scannerData === codeData;
    logger.info(`Comparison result: ${isMatch ? "Match" : "No match"}`);
    return isMatch;
  } catch (error) {
    logger.error(
      `Error comparing scanner data with code file: ${error.message}`
    );
    throw error;
  }
}

const c = 0;
const shiftUtility = new ShiftUtility();
const barcodeGenerator = new BarcodeGenerator(shiftUtility);
barcodeGenerator.initialize("main-data", "records");
barcodeGenerator.setResetTime(6, 0);
// const comService = new BufferedComPortService({
//   path: "COM3", // Make sure this matches your actual COM port
//   baudRate: 9600, // Adjust if needed
//   logDir: "com_port_logs", // Specify the directory for log files
// });

const resetEmitter = new EventEmitter();

const lastResetTime = 0;
const RESET_COOLDOWN = 1000; // 1 second cooldown between resets
const SCAN_READNER = 10 * 1000; // 1 second cooldown between resets

const sleep = promisify(setTimeout);

async function waitForBitToBecomeOne(register, bit, value) {
  logger.debug(`awaiting ${register} , bit ${bit}`);
  return new Promise((resolve, reject) => {
    const checkBit = async () => {
      try {
        while (true) {
          const bitValue = await readBit(register, bit);
          if (bitValue === value) {
            resolve("bitChanged");
            return;
          }
          await sleep(50);
        }
      } catch (error) {
        reject(error);
      }
    };

    const resetHandler = () => {
      resolve("reset");
    };

    resetEmitter.on("reset", resetHandler);
    checkBit().finally(() => {
      resetEmitter.removeListener("reset", resetHandler);
    });
  });
}
const TIMEOUT = 30000;
async function checkResetOrBit(register, bit, value) {
  // console.log({ register, bit, value });
  logger.info(
    "-----------------------------------------------------------------------------------------------------------"
  );
  logger.debug(`awaiting ${register} , bit ${bit}`);
  logger.info(
    "-----------------------------------------------------------------------------------------------------------"
  );
  return new Promise(async (resolve) => {
    let timeoutId;
    let intervalId;

    const cleanup = () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };

    const checkReset = async () => {
      try {
        const resetSignal = await readBit(1600, 0);
        if (resetSignal) {
          cleanup();
          logger.info(`Reset detected while waiting for ${register}.${bit}.`);
          await resetBits();
          resolve(true);
        }
      } catch (error) {
        logger.error(`Error checking reset signal: ${error}`);
      }
    };

    const checkBit = async () => {
      try {
        const bitValue = await readBit(register, bit);
        // console.log({ bitValue });
        if (bitValue == value) {
          cleanup();
          logger.info(`Received signal from PLC at ${register}.${bit}`);
          resolve(false);
        }
      } catch (error) {
        logger.error(`Error reading bit ${register}.${bit}: ${error}`);
      }
    };

    timeoutId = setTimeout(() => {
      cleanup();
      logger.warn(`Timeout waiting for ${register}.${bit} to become ${value}`);
      resolve(true); // Treat timeout as reset
    }, TIMEOUT);

    intervalId = setInterval(async () => {
      await checkReset();
      await checkBit();
    }, 100); // Check every 100ms

    // Initial check
    await checkReset();
    await checkBit();
  });
}

module.exports = {
  sleep,
  runContinuousScan,
  resetBits,
  resetBits2,
};
