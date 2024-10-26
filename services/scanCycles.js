import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import logger from '../logger.js';
import mongoDbService from './mongoDbService.js';
import {
  readBit,
  readRegister,
  writeBit,
  writeBitsWithRest,
  writeRegister,
} from './modbus.js';
import ShiftUtility from './ShiftUtility.js';
import BarcodeGenerator from './barcodeGenrator.js';
import { promisify } from 'util';
import fs from 'fs';
import { format } from 'date-fns';
import { Worker } from 'worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CODE_FILE_PATH = path.join(__dirname, '../data/code.txt');
export const sleep = promisify(setTimeout);

const TIMEOUT = 30000;

class ScannerController {
  static instance = null;

  constructor() {
    if (ScannerController.instance) {
      return ScannerController.instance;
    }

    this.resetMonitor = null;
    this.comService = null;
    this.isInitialized = false;
    this.shiftUtility = new ShiftUtility();
    this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
    this.setupShutdownHandlers();

    ScannerController.instance = this;
  }

  async initialize() {
    if (this.isInitialized) {
      logger.info('Scanner controller already initialized');
      return;
    }

    try {
      logger.info('Initializing scanner controller...');

      // Initialize MongoDB connection
      logger.debug('Attempting to connect to MongoDB...');
      await mongoDbService.connect('main-data', 'records');
      logger.info('Connected to MongoDB successfully');

      // Initialize barcode generator
      this.shiftUtility = new ShiftUtility();
      this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
      await this.barcodeGenerator.initialize('main-data', 'records');
      this.barcodeGenerator.setResetTime(6, 0);

      this.isInitialized = true;
      logger.info('Scanner controller initialized successfully');
    } catch (error) {
      logger.error('Error initializing scanner controller:', error);
      this.isInitialized = false;

      if (error.message.includes('MongoDB')) {
        logger.debug('Waiting 5 seconds before retrying MongoDB connection');
        await sleep(5000);
        return this.initialize(); // Retry initialization
      }

      throw error;
    }
  }

  async initializeComService(comService) {
    try {
      logger.debug('Attempting to initialize serial port...');
      if (comService && typeof comService.initSerialPort === 'function') {
        await comService.initSerialPort();
        logger.info('Initialized serial port successfully');
      }
    } catch (comError) {
      logger.error('Failed to initialize serial port:', comError);
      logger.debug(
        'Waiting 5 seconds before retrying serial port initialization'
      );
      await sleep(5000);
      return this.initializeComService(comService); // Retry COM port initialization
    }
  }

  async resetBits() {
    await this.resetSpecificBits(1414, [3, 4, 6, 7]);
    await this.resetSpecificBits(1415, [4]);
  }

  async resetBits2() {
    await this.resetSpecificBits(1414, [3, 4, 6, 7]);
    await this.resetSpecificBits(1410, [0]);
  }

  async resetSpecificBits(register, bitsToReset) {
    try {
      logger.info(
        `Attempting to reset bits ${bitsToReset.join(', ')} in register ${register}`
      );

      if (
        !Array.isArray(bitsToReset) ||
        bitsToReset.some((bit) => bit < 0 || bit > 15)
      ) {
        throw new Error('Invalid bits array. Must be an array of numbers 0-15');
      }

      const [currentValue] = await readRegister(register, 1);
      const mask = bitsToReset.reduce(
        (mask, bit) => mask & ~(1 << bit),
        0xffff
      );
      const newValue = currentValue & mask;

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
        `Successfully reset bits ${bitsToReset.join(', ')} in register ${register}`
      );
    } catch (error) {
      logger.error(`Error resetting bits in register ${register}:`, error);
      throw error;
    }
  }

  setupShutdownHandlers() {
    if (!this.shutdownHandlersSet) {
      // eslint-disable-next-line no-undef
      process.on('SIGINT', async () => {
        await this.cleanup();
        // eslint-disable-next-line no-undef
        process.exit(0);
      });

      // eslint-disable-next-line no-undef
      process.on('SIGTERM', async () => {
        await this.cleanup();
        // eslint-disable-next-line no-undef
        process.exit(0);
      });

      this.shutdownHandlersSet = true;
    }
  }

  async cleanup() {
    logger.info('Cleaning up resources...');
    if (this.resetMonitor) {
      this.resetMonitor.terminate();
    }
    if (this.comService) {
      await this.comService.closePort();
    }
    await mongoDbService.disconnect();
    await this.resetBits();
  }

  async checkResetOrBit(register, bit, value) {
    logger.info(
      '-----------------------------------------------------------------------------------------------------------'
    );
    logger.debug(`awaiting ${register} , bit ${bit}`);
    logger.info(
      '-----------------------------------------------------------------------------------------------------------'
    );

    return new Promise(async (resolve) => {
      // eslint-disable-next-line prefer-const
      let timeoutId;
      // eslint-disable-next-line prefer-const
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
            await this.resetBits();
            resolve(true);
          }
        } catch (error) {
          logger.error(`Error checking reset signal: ${error}`);
        }
      };

      const checkBit = async () => {
        try {
          const bitValue = await readBit(register, bit);
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
        logger.warn(
          `Timeout waiting for ${register}.${bit} to become ${value}`
        );
        resolve(true);
      }, TIMEOUT);

      intervalId = setInterval(async () => {
        await checkReset();
        await checkBit();
      }, 100);

      await checkReset();
      await checkBit();
    });
  }

  async writeOCRDataToFile(ocrDataString) {
    try {
      await this.clearCodeFile(CODE_FILE_PATH);
      fs.writeFileSync(CODE_FILE_PATH, ocrDataString, 'utf8');
      logger.info('OCR data written to code.txt');
    } catch (error) {
      logger.error(`Error writing OCR data to file: ${error.message}`);
      throw error;
    }
  }

  async clearCodeFile(path) {
    try {
      fs.writeFileSync(path, '', 'utf8');
      logger.info('Code file cleared.');
    } catch (error) {
      logger.error(`Error clearing code file: ${error.message}`);
      throw error;
    }
  }

  async compareScannerDataWithCode(scannerData) {
    try {
      const codeData = fs.readFileSync(CODE_FILE_PATH, 'utf8').trim();
      const isMatch = scannerData === codeData;
      logger.info(`Comparison result: ${isMatch ? 'Match' : 'No match'}`);
      return isMatch;
    } catch (error) {
      logger.error(
        `Error comparing scanner data with code file: ${error.message}`
      );
      throw error;
    }
  }

  async saveToMongoDB({ io, serialNumber, markingData, scannerData, result }) {
    const now = new Date();
    const timestamp = format(now, 'yyyy-MM-dd HH:mm:ss');

    const data = {
      Timestamp: new Date(timestamp),
      SerialNumber: serialNumber,
      MarkingData: markingData,
      ScannerData: scannerData,
      Result: result ? 'OK' : 'NG',
    };

    try {
      await mongoDbService.insertRecord(data);
      logger.info('Data saved to MongoDB');

      if (io) {
        mongoDbService.sendMongoDbDataToClient(io, 'main-data', 'records');
      }
    } catch (error) {
      console.error({ error });
      logger.error('Error saving data:', error);
      throw error;
    }
  }

  async verifyAndRetryWrite(expectedData, retriesLeft) {
    for (let attempt = 1; attempt <= retriesLeft + 1; attempt++) {
      const actualData = await fs.readFileSync(CODE_FILE_PATH, 'utf8');
      if (actualData === expectedData) {
        return true;
      }

      if (attempt <= retriesLeft) {
        logger.warn(
          `Verification attempt ${attempt} failed. Retrying write operation...`
        );
        await fs.writeFileSync(CODE_FILE_PATH, expectedData, 'utf8');
      }
    }

    return false;
  }

  async runContinuousScan(io = null, comService, { partNumber }) {
    let isRunning = true;
    let c = 0;
    try {
      // Ensure initialization is done
      if (!this.isInitialized) {
        await this.initialize();
      }
      this.comService = comService; // Store the comService reference
      this.resetMonitor = new Worker('./services/resetMonitor.js');

      this.resetMonitor.on('message', async (message) => {
        if (message === 'reset') {
          logger.info('Reset signal received from monitor - restarting cycle');
          isRunning = false;

          await this.resetBits();
          await this.clearCodeFile(CODE_FILE_PATH);

          this.runContinuousScan(io, comService, { partNumber });
        }
      });

      this.resetMonitor.on('error', (error) => {
        logger.error('Reset monitor error:', error);
      });

      // Start the monitor
      this.resetMonitor.postMessage('start');
    } catch (error) {
      console.log({ error });
      logger.error('Error in runContinuousScan:', error);
    }

    while (isRunning) {
    //   logger.info('Test-1');
      try {
        logger.info(`Starting scan cycle ${c + 1}`);
        await this.resetBits();
        await writeBit(1410, 0, 1);
        // await sleep(5 * 1000);
        logger.info('Clearing buffer before second scan...');
        // comService.clearBuffer();
        if (await this.checkResetOrBit(1410, 0, 1)) {
          logger.info('Reset detected at final step, restarting cycle');
          continue;
        }
        await writeBit(1410, 0, 0);

        logger.info('Starting scanner workflow');
        logger.info(
          '-----------------------------------------------------------------------------------------------------------'
        );
        // logger.info("Trigger First Scanner on ........");
        // await writeBitsWithRest(1415, 0, 1, 800, false);
        // // await sleep(1000);
        // logger.info("=== STARTING FIRST SCAN ===");
        // logger.info(
        //   "-----------------------------------------------------------------------------------------------------------"
        // );
        // await writeBitsWithRest(1415, 0, 1, 800, false);

        const scannerData = 'NG';
        // try {
        //   // Step 1: Set up the event listener for incoming scanner data
        //   logger.info("Setting up data listener for first scan...");

        //   // Create a promise that resolves when data is received
        //   scannerData = await new Promise((resolve, reject) => {
        //     const dataHandler = (data) => {
        //       logger.info(`Data received: ${data}`);
        //       // resolve(data); // Resolve the promise when data is received
        //       resolve("NG"); // Resolve the promise when data is received
        //       comService.off("dataGot", dataHandler); // Remove listener once data is processed
        //     };

        //     // Add event listener for incoming data
        //     comService.on("dataGot", dataHandler);

        //     // Set a timeout to avoid hanging indefinitely
        //     const timeout = setTimeout(() => {
        //       comService.off("dataGot", dataHandler);
        //       reject(new Error("Timeout waiting for scanner data"));
        //     }, 2000); // Adjust timeout as needed

        //     // Trigger the scanner after the event listener is set
        //     logger.info("Triggering the scanner...");
        //     writeBitsWithRest(1415, 0, 1, 100, false)
        //       .then(() => logger.info("Scanner triggered"))
        //       .catch((err) =>
        //         logger.error(`Error triggering scanner: ${err.message}`)
        //       );
        //   });

        //   logger.info(`Scanner data received: ${scannerData}`);
        // } catch (error) {
        //   console.log({ error });
        //   logger.error("Error or timeout waiting for scanner data:", error);
        //   continue; // Retry or handle the error
        // }
        // await sleep(5 * 1000);

        if (scannerData !== 'NG') {
          logger.info('First scan data is OK, stopping machine');
          logger.info('Writing bit 1414.6 to signal OK scan');
          await writeBitsWithRest(1414, 6, 1, 200, false);
          await this.resetBits2();
          continue;
        }

        logger.info('First scan data is NG, proceeding with workflow');
        logger.info('Writing bit 1414.7 to signal NG scan');
        await writeBitsWithRest(1414, 7, 1, 100, false);
        // await sleep(5 * 1000);

        logger.info('Generating barcode data');
        console.log({ partNumber });
        const { text, serialNo } =
          await this.barcodeGenerator.generateBarcodeData({
            date: new Date(),
            mongoDbService,
            partNumber,
          });
        console.log({ text });
        logger.info(
          '-----------------------------------------------------------------------------------------------------------'
        );
        logger.info('Writing OCR data to file');
        await this.writeOCRDataToFile(text);
        // await verifyWriteOperation(text);
        await this.verifyAndRetryWrite(text, 2);

        logger.info('OCR data transferred to text file');

        await sleep(2 * 1000);

        logger.info('Writing bit 1410.11 to signal file transfer');
        await writeBitsWithRest(1410, 11, 1, 100, false);
        logger.info(
          '-----------------------------------------------------------------------------------------------------------'
        );

        // logger.info("Writing bit 1415.4 to confirm file transfer to PLC");
        // await writeBitsWithRest(1415, 4, 1, 100, false);
        // logger.info("File transfer confirmation sent to PLC");
        // await sleep(1000);

        logger.info('Checking for reset or waiting for bit 1410.2');
        if (await this.checkResetOrBit(1410, 2, 1)) {
          logger.info(
            'Reset detected while waiting for 1410.2, restarting cycle'
          );
          this.barcodeGenerator.decSerialNo();
          continue;
        }
        logger.info('Clearing buffer before second scan...');
        // comService.clearBuffer();

        logger.info(
          '-----------------------------------------------------------------------------------------------------------'
        );

        logger.info('=== STARTING SECOND SCAN ===');
        logger.info(
          '-----------------------------------------------------------------------------------------------------------'
        );
        logger.info('Writing bit 1414.F(15) to trigger second scanner');
        // await writeBitsWithRest(1414, 15, 1, 800, false);
        logger.info('Triggered second scanner');
        // await sleep(1000);
        // await writeBitsWithRest(1414, 15, 1, 800, false);

        // await sleep(1000);
        const secondScannerData = 'NG';
        // try {
        //   // Step 1: Set up the event listener for incoming scanner data
        //   logger.info("Setting up data listener for second scan...");

        //   // Create a promise that resolves when data is received
        //   secondScannerData = await new Promise((resolve, reject) => {
        //     const dataHandler = (data) => {
        //       logger.info(`Data received: ${data}`);
        //       resolve("NG"); // Resolve the promise when data is received
        //       comService.off("dataGot", dataHandler); // Remove listener once data is processed
        //     };

        //     // Add event listener for incoming data
        //     comService.on("dataGot", dataHandler);

        //     // Set a timeout to avoid hanging indefinitely
        //     const timeout = setTimeout(() => {
        //       comService.off("dataGot", dataHandler);
        //       reject(new Error("Timeout waiting for scanner data"));
        //     }, 10000); // Adjust timeout as needed

        //     // Trigger the scanner after the event listener is set
        //     logger.info("Triggering the scanner...");
        //     writeBitsWithRest(1416, 15, 1, 100, false)
        //       .then(() => logger.info("Second Scanner triggered"))
        //       .catch((err) =>
        //         logger.error(`Error triggering scanner: ${err.message}`)
        //       );
        //   });

        //   logger.info(`Scanner data received: ${secondScannerData}`);
        // } catch (error) {
        //   logger.error("Error or timeout waiting for scanner data:", error);
        //   continue; // Retry or handle the error
        // }
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

        // logger.info('Checking for reset after second scan');
        // if (await this.checkReset()) {
        //   logger.info('Reset detected after second scan, restarting cycle');
        // //   this.barcodeGenerator.decSerialNo();
        //   continue;
        // }

        logger.info(
          `Writing bit 1414.${secondScannerData !== 'NG' ? 6 : 7} to signal scan result`
        );
        await writeBitsWithRest(
          1414,
          secondScannerData !== 'NG' ? 6 : 7,
          1,
          200,
          false
        );
        logger.info(
          secondScannerData !== 'NG' ? 'Second scan OK' : 'Second scan NG'
        );

        logger.info('Comparing scanner data with code');
        const isDataMatching =
          await this.compareScannerDataWithCode(secondScannerData);

        // logger.info('Checking for reset after data comparison');
        // if (await this.checkReset()) {
        //   logger.info('Reset detected after data comparison, restarting cycle');
        //   this.barcodeGenerator.decSerialNo();
        //   continue;
        // }

        logger.info(
          `Writing bit 1414.${isDataMatching ? 3 : 4} to signal data match result`
        );
        await writeBitsWithRest(1414, isDataMatching ? 3 : 4, 1, 200, false);
        logger.info(isDataMatching ? 'Data matches' : 'Data does not match');

        logger.info('Saving data to MongoDB');
        await this.saveToMongoDB({
          io,
          serialNumber: serialNo,
          markingData: text,
          scannerData: secondScannerData,
          result: isDataMatching,
        });
        logger.info('Data saved to MongoDB');

        logger.info('Checking for reset or waiting for bit 1410.12');
        if (await this.checkResetOrBit(1410, 12, 1)) {
          logger.info('Reset detected at final step, restarting cycle');
        //   this.barcodeGenerator.decSerialNo();
          continue;
        }
        logger.info('Clear Code file before next cyce');
        await this.clearCodeFile(CODE_FILE_PATH);
        logger.info('Clear Code file before next cyce- Success DONE');
        c++;
        // logger.info("Resetting bits");
        // await resetBits();
        logger.info(
          '-----------------------------------------------------------------------------------------------------------'
        );
        logger.info(`Completed scan cycle ${c}`);
        logger.info(
          '-----------------------------------------------------------------------------------------------------------'
        );
        await sleep(3 * 1000);
      } catch (error) {
        logger.error('Unexpected error in scanner workflow:', error);
        logger.info('Calling handleError for unexpected error');
        await this.handleError(error);
        logger.info('Waiting 5 seconds before retrying');
        await sleep(5000);
      }

      // logger.debug("Waiting 100ms before next cycle");
      // await sleep(100);
    }
  }

  async handleError(error) {
    console.log({ error });
    try {
      // await writeBitsWithRest(1414, 12, 1, false);
    } catch (secondaryError) {
      logger.error('Error during error handling:', secondaryError);
    }
  }

  async checkReset() {
    return new Promise((resolve) => {
      const resetHandler = () => {
        this.resetEmitter.removeListener('reset', resetHandler);
        resolve(true);
      };
      this.resetEmitter.once('reset', resetHandler);
      setTimeout(() => {
        this.resetEmitter.removeListener('reset', resetHandler);
        resolve(false);
      }, 50);
    });
  }
}

// Export an instance
export const scannerController = new ScannerController();
