import { fileURLToPath } from "url";
import logger from "../logger.js";
import {
  connect,
  readBit,
  readRegister,
  writeBitsWithRest,
  writeRegister,
  writeRegisterFull,
} from "./modbus.js";
// import { waitForBitToBecomeOne } from "./serialPortService.js";

import { format } from "date-fns";
import fs from "fs";
import path, { dirname } from "path";
import ComPortService from "./ComPortService.js";
import ShiftUtility from "./ShiftUtility.js";
import BarcodeGenerator from "./barcodeGenrator.js";
import mongoDbService from "./mongoDbService.js";
import BufferedComPortService from "./ComPortService.js";
import EventEmitter from "events";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { promisify } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const comPort = new ComPortService();

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
    logger.info(`Data saved to MongoDB`);

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
const comService = new BufferedComPortService({
  path: "COM3", // Make sure this matches your actual COM port
  baudRate: 9600, // Adjust if needed
  logDir: "com_port_logs", // Specify the directory for log files
});

const resetEmitter = new EventEmitter();

const lastResetTime = 0;
const RESET_COOLDOWN = 1000; // 1 second cooldown between resets
const SCAN_READNER = 10 * 1000; // 1 second cooldown between resets

export const sleep = promisify(setTimeout);

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
  console.log({ register, bit, value });
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
        console.log({ bitValue });
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

export async function runContinuousScan(io = null, comService) {
  let c = 0;
  try {
    logger.debug("Attempting to connect to MongoDB...");
    await mongoDbService.connect("main-data", "records");
    logger.info("Connected to MongoDB successfully");
  } catch (dbError) {
    logger.error("Failed to connect to MongoDB:", dbError);
    logger.debug("Waiting 5 seconds before retrying MongoDB connection");
    await sleep(5000);
    // continue;
  }

  try {
    logger.debug("Attempting to initialize serial port...");
    await comService.initSerialPort();
    logger.info("Initialized serial port successfully");
  } catch (comError) {
    logger.error("Failed to initialize serial port:", comError);
    logger.debug(
      "Waiting 5 seconds before retrying serial port initialization"
    );
    await sleep(5000);
    // continue;
  }

  // Start the reset signal monitor as a separate process
  const monitorProcess = new Worker("./services/monitorReset.js"); // services\monitorReset.js C:\Users\LASER_CASE_2\Project\ricov3\LaserScanner_V2\services\monitorReset.js
  logger.info("Started reset signal monitor process");

  // Send a message to the worker to start monitoring

  // monitorProcess.on("message", (message) => {
  //   if (message === "reset") {
  //     logger.info("Received reset signal from monitor process");
  //     resetEmitter.emit("reset");
  //   }
  // });

  // monitorProcess.on("error", (error) => {
  //   logger.error("Error in worker thread:", error);
  // });

  monitorProcess.on("message", async (message) => {
    if (message.type === "readBit") {
      try {
        const bitValue = await readBit(message.register, message.bit);
        monitorProcess.postMessage({ type: "bitValue", value: bitValue });
      } catch (error) {
        logger.error("Error reading bit:", error);
        monitorProcess.postMessage({ type: "error", error: error.message });
      }
    } else if (message.type === "reset") {
      logger.info("Reset signal detected by monitorProcess thread");
      // Handle reset logic here
      await resetBits();
    }
  });

  monitorProcess.on("error", (error) => {
    logger.error("Worker error:", error);
  });

  monitorProcess.on("exit", (code) => {
    if (code !== 0) {
      logger.error(`Worker stopped with exit code ${code}`);
    }
  });

  monitorProcess.postMessage("start");

  while (true) {
    logger.info(`Test-1`);
    try {
      logger.info(`Starting scan cycle ${c + 1}`);
      await resetBits();
      logger.info("Clearing buffer before second scan...");
      comService.clearBuffer();
      if (await checkResetOrBit(1410, 0, 1)) {
        logger.info("Reset detected at final step, restarting cycle");
        continue;
      }
      logger.info("Starting scanner workflow");
      logger.info(
        "-----------------------------------------------------------------------------------------------------------"
      );
      // logger.info("Trigger First Scanner on ........");
      // await writeBitsWithRest(1415, 0, 1, 800, false);
      // // await sleep(1000);
      // logger.info("=== STARTING FIRST SCAN ===");
      // logger.info(
      //   "-----------------------------------------------------------------------------------------------------------"
      // );
      // await writeBitsWithRest(1415, 0, 1, 800, false);

      let scannerData;
      try {
        // Step 1: Set up the event listener for incoming scanner data
        logger.info("Setting up data listener for first scan...");

        // Create a promise that resolves when data is received
        scannerData = await new Promise((resolve, reject) => {
          const dataHandler = (data) => {
            logger.info(`Data received: ${data}`);
            resolve(data); // Resolve the promise when data is received
            comService.off("dataGot", dataHandler); // Remove listener once data is processed
          };

          // Add event listener for incoming data
          comService.on("dataGot", dataHandler);

          // Set a timeout to avoid hanging indefinitely
          const timeout = setTimeout(() => {
            comService.off("dataGot", dataHandler);
            reject(new Error("Timeout waiting for scanner data"));
          }, 10000); // Adjust timeout as needed

          // Trigger the scanner after the event listener is set
          logger.info("Triggering the scanner...");
          writeBitsWithRest(1415, 0, 1, 100, false)
            .then(() => logger.info("Scanner triggered"))
            .catch((err) =>
              logger.error(`Error triggering scanner: ${err.message}`)
            );
        });

        logger.info(`Scanner data received: ${scannerData}`);
      } catch (error) {
        logger.error("Error or timeout waiting for scanner data:", error);
        continue; // Retry or handle the error
      }
      // await sleep(5 * 1000);

      // if (scannerData !== "NG") {
      //   logger.info("First scan data is OK, stopping machine");
      //   logger.info("Writing bit 1414.6 to signal OK scan");
      //   await writeBitsWithRest(1414, 6, 1, 200, false);
      //   continue;
      // }

      logger.info("First scan data is NG, proceeding with workflow");
      logger.info("Writing bit 1414.7 to signal NG scan");
      await writeBitsWithRest(1414, 7, 1, 100, false);
      // await sleep(5 * 1000);

      logger.info("Generating barcode data");
      const { text, serialNo } = barcodeGenerator.generateBarcodeData();

      logger.info("Writing OCR data to file");
      await writeOCRDataToFile(text);
      logger.info("OCR data transferred to text file");

      logger.info("Writing bit 1410.11 to signal file transfer");
      await writeBitsWithRest(1410, 11, 1, 100, false);

      // logger.info("Writing bit 1415.4 to confirm file transfer to PLC");
      // await writeBitsWithRest(1415, 4, 1, 100, false);
      // logger.info("File transfer confirmation sent to PLC");
      await sleep(1000);

      logger.info("Checking for reset or waiting for bit 1410.2");
      if (await checkResetOrBit(1410, 2, 1)) {
        logger.info(
          "Reset detected while waiting for 1410.2, restarting cycle"
        );
        continue;
      }
      logger.info("Clearing buffer before second scan...");
      comService.clearBuffer();

      logger.info(
        "-----------------------------------------------------------------------------------------------------------"
      );

      logger.info("=== STARTING SECOND SCAN ===");
      logger.info(
        "-----------------------------------------------------------------------------------------------------------"
      );
      logger.info("Writing bit 1414.F(15) to trigger second scanner");
      // await writeBitsWithRest(1414, 15, 1, 800, false);
      logger.info("Triggered second scanner");
      // await sleep(1000);
      // await writeBitsWithRest(1414, 15, 1, 800, false);

      // await sleep(1000);
      let secondScannerData;
      try {
        // Step 1: Set up the event listener for incoming scanner data
        logger.info("Setting up data listener for second scan...");

        // Create a promise that resolves when data is received
        secondScannerData = await new Promise((resolve, reject) => {
          const dataHandler = (data) => {
            logger.info(`Data received: ${data}`);
            resolve(data); // Resolve the promise when data is received
            comService.off("dataGot", dataHandler); // Remove listener once data is processed
          };

          // Add event listener for incoming data
          comService.on("dataGot", dataHandler);

          // Set a timeout to avoid hanging indefinitely
          const timeout = setTimeout(() => {
            comService.off("dataGot", dataHandler);
            reject(new Error("Timeout waiting for scanner data"));
          }, 10000); // Adjust timeout as needed

          // Trigger the scanner after the event listener is set
          logger.info("Triggering the scanner...");
          writeBitsWithRest(1414, 15, 1, 100, false)
            .then(() => logger.info("Second Scanner triggered"))
            .catch((err) =>
              logger.error(`Error triggering scanner: ${err.message}`)
            );
        });

        logger.info(`Scanner data received: ${secondScannerData}`);
      } catch (error) {
        logger.error("Error or timeout waiting for scanner data:", error);
        continue; // Retry or handle the error
      }
      // let secondScannerData;
      // try {
      //   logger.info("Checking if queue already has data...");
      //   if (comService.dataQueue.length() > 0) {
      //     const task = comService.dataQueue.shift(); // Pick from the queue
      //     secondScannerData = task.line;
      //     logger.info(
      //       `Processing existing data from queue: ${secondScannerData}`
      //     );
      //   } else {
      //     // If no data in queue, wait for new data from first scan
      //     logger.info("No data in queue, waiting for first scan data...");
      //     secondScannerData = await new Promise((resolve) => {
      //       comService.once("data", resolve);
      //     });
      //     logger.info(`First scan data: ${secondScannerData}`);
      //   }
      // } catch (scanError) {
      //   logger.error("Error reading first scanner data:", scanError);
      //   continue;
      // }

      logger.info("Checking for reset after second scan");
      if (await checkReset()) {
        logger.info("Reset detected after second scan, restarting cycle");
        continue;
      }

      logger.info(
        `Writing bit 1414.${secondScannerData !== "NG" ? 6 : 7} to signal scan result`
      );
      await writeBitsWithRest(
        1414,
        secondScannerData !== "NG" ? 6 : 7,
        1,
        200,
        false
      );
      logger.info(
        secondScannerData !== "NG" ? "Second scan OK" : "Second scan NG"
      );

      logger.info("Comparing scanner data with code");
      const isDataMatching =
        await compareScannerDataWithCode(secondScannerData);

      logger.info("Checking for reset after data comparison");
      if (await checkReset()) {
        logger.info("Reset detected after data comparison, restarting cycle");
        continue;
      }

      logger.info(
        `Writing bit 1414.${isDataMatching ? 3 : 4} to signal data match result`
      );
      await writeBitsWithRest(1414, isDataMatching ? 3 : 4, 1, 200, false);
      logger.info(isDataMatching ? "Data matches" : "Data does not match");

      logger.info("Saving data to MongoDB");
      await saveToMongoDB({
        io,
        serialNumber: serialNo,
        markingData: text,
        scannerData: secondScannerData,
        result: isDataMatching,
      });
      logger.info("Data saved to MongoDB");

      logger.info("Checking for reset or waiting for bit 1410.12");
      if (await checkResetOrBit(1410, 12, 1)) {
        logger.info("Reset detected at final step, restarting cycle");
        continue;
      }

      c++;
      logger.info("Resetting bits");
      // await resetBits();
      logger.info(
        "-----------------------------------------------------------------------------------------------------------"
      );
      logger.info(`Completed scan cycle ${c}`);
      logger.info(
        "-----------------------------------------------------------------------------------------------------------"
      );
    } catch (error) {
      logger.error("Unexpected error in scanner workflow:", error);
      logger.info("Calling handleError for unexpected error");
      await handleError(error);
      logger.info("Waiting 5 seconds before retrying");
      await sleep(5000);
    }

    // logger.debug("Waiting 100ms before next cycle");
    // await sleep(100);
  }
}

async function resetSpecificBits(register, bitsToReset) {
  try {
    logger.info(
      `Attempting to reset bits ${bitsToReset.join(", ")} in register ${register}`
    );

    // Validate input
    if (
      !Array.isArray(bitsToReset) ||
      bitsToReset.some((bit) => bit < 0 || bit > 15)
    ) {
      throw new Error("Invalid bits array. Must be an array of numbers 0-15");
    }

    // First, read the current value of the register
    const [currentValue] = await readRegister(register, 1);

    // Create a mask to reset only the specified bits
    const mask = bitsToReset.reduce((mask, bit) => mask & ~(1 << bit), 0xffff);
    // console.log({ mask });
    // Apply the mask to the current value
    const newValue = currentValue & mask;
    // console.log({ newValue });

    const resetPromise = writeRegister(register, newValue);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`Timeout resetting bits in register ${register}`)),
        TIMEOUT
      )
    );

    await Promise.race([resetPromise, timeoutPromise]);

    logger.info(
      `Successfully reset bits ${bitsToReset.join(", ")} in register ${register}`
    );
  } catch (error) {
    if (error.message.startsWith("Timeout resetting bits")) {
      logger.error(
        `Operation timed out while resetting bits in register ${register}`
      );
    } else {
      logger.error(`Error resetting bits in register ${register}:`, error);
    }
    throw error; // Re-throw the error for the caller to handle if needed
  }
}
async function handleError(error) {
  console.log({ error });
  try {
    // await writeBitsWithRest(1414, 12, 1, false);
  } catch (secondaryError) {
    logger.error("Error during error handling:", secondaryError);
  }
}

async function checkReset() {
  return new Promise((resolve) => {
    const resetHandler = () => {
      resetEmitter.removeListener("reset", resetHandler);
      resolve(true);
    };
    resetEmitter.once("reset", resetHandler);
    setTimeout(() => {
      resetEmitter.removeListener("reset", resetHandler);
      resolve(false);
    }, 50);
  });
}

export async function resetBits() {
  await resetSpecificBits(1414, [3, 4, 6, 7]);
  await resetSpecificBits(1415, [4]);
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Received SIGINT. Closing MongoDB connection and exiting...");
  await mongoDbService.disconnect();
  await resetBits();
  await comPort.closePort();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM. Closing MongoDB connection and exiting...");
  await mongoDbService.disconnect();
  await resetBits();
  await comPort.closePort();
  process.exit(0);
});

async function testCheckResetOrBit() {
  logger.info("Starting test for checkResetOrBit function");

  try {
    logger.info("Checking register 1410, bit 2");
    const result = await checkResetOrBit(1410, 2, 1);

    if (result === true) {
      logger.info("Function returned true: Reset detected or timeout occurred");
    } else {
      logger.info("Function returned false: Bit became 1 as expected");
    }
  } catch (error) {
    logger.error("An error occurred during the test:", error);
  }

  logger.info("Test completed");
}

// Run the test
// testCheckResetOrBit()
//   .then(() => {
//     logger.info("Test execution finished");
//     process.exit(0);
//   })
//   .catch((error) => {
//     logger.error("Test failed with error:", error);
//     process.exit(1);
//   });

function runWorker() {
  const worker = new Worker("./services/monitorReset.js");

  worker.on("message", (message) => {
    console.log("Received message from worker:", message);
    if (message === "reset") {
      console.log("Reset signal detected by worker");
    }
  });

  worker.on("error", (error) => {
    console.error("Worker error:", error);
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Worker stopped with exit code ${code}`);
    } else {
      console.log("Worker completed successfully");
    }
  });

  worker.postMessage("start");
}

// runWorker();

async function testBitManipulation() {
  try {
    logger.info("Starting comprehensive bit manipulation test");

    await connect();
    logger.info("Modbus connection established");

    const testRegister = 1417;

    // Step 1: Set all bits to 1
    const allBitsSet = 0xffff; // 16-bit register with all bits set to 1
    await writeRegister(testRegister, allBitsSet);
    logger.info(`Set all bits in register ${testRegister} to 1`);

    // Verify all bits are set
    const [initialValue] = await readRegister(testRegister, 1);
    logger.info(`Initial register value: 0x${initialValue.toString(16)}`);
    if (initialValue !== allBitsSet) {
      throw new Error("Failed to set all bits to 1");
    }

    // Step 2: Reset every alternate bit
    const bitsToReset = [0, 2, 4, 6, 8, 10, 12, 14]; // Every even-numbered bit
    await resetSpecificBits(testRegister, bitsToReset);
    logger.info(`Reset alternate bits: ${bitsToReset.join(", ")}`);

    // Verify the result
    const [afterResetValue] = await readRegister(testRegister, 1);
    logger.info(
      `Register value after reset: 0x${afterResetValue.toString(16)}`
    );

    // Expected value after resetting alternate bits
    const expectedValue = 0x5555; // Binary: 0101 0101 0101 0101

    if (afterResetValue === expectedValue) {
      logger.info(
        "Reset operation successful: alternate bits were correctly reset"
      );
    } else {
      logger.error(
        `Unexpected result: expected 0x${expectedValue.toString(16)}, got 0x${afterResetValue.toString(16)}`
      );
    }

    // Binary representation for clearer visualization
    logger.info(
      `Binary representation of result:   ${afterResetValue.toString(2).padStart(16, "0")}`
    );
    logger.info(
      `Expected binary representation:    ${expectedValue.toString(2).padStart(16, "0")}`
    );
  } catch (error) {
    logger.error("Test failed:", error);
  } finally {
    logger.info("Test completed");
  }
}

// testBitManipulation();
