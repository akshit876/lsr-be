import { format, isAfter, isSameDay, isBefore } from "date-fns";
import MongoDBService from "./mongoDbService.js";
import logger from "../logger.js";

class SerialNumberGeneratorService {
  constructor() {
    this.currentSerialNumber = 1;
    this.lastResetDate = new Date();
    this.resetHour = 6;
    this.resetMinute = 0;
    this.isInitialized = false;
  }

  //   async initialize(dbName, collectionName) {
  //     if (this.isInitialized) {
  //       logger.info("SerialNumberGeneratorService already initialized");
  //       return;
  //     }

  //     try {
  //       await MongoDBService.connect(dbName, collectionName);
  //       const lastDocument = await this.getLastDocumentFromMongoDB();

  //       if (lastDocument) {
  //         this.currentSerialNumber = this.extractSerialNumberFromOCR(
  //           lastDocument.OCRData
  //         );
  //         logger.info(
  //           `Initialized serial number to ${this.currentSerialNumber} from last MongoDB document`
  //         );
  //       } else {
  //         this.currentSerialNumber = 1;
  //         logger.info(
  //           "No previous documents found, starting with serial number 0001"
  //         );
  //       }

  //       this.isInitialized = true;
  //     } catch (error) {
  //       logger.error("Error initializing SerialNumberGeneratorService:", error);
  //       throw error;
  //     }
  //   }

  //   async getLastDocumentFromMongoDB() {
  //     try {
  //       const latestRecord = await MongoDBService.collection
  //         .find()
  //         .sort({ Timestamp: -1 })
  //         .limit(1)
  //         .toArray();

  //       return latestRecord[0] || null;
  //     } catch (error) {
  //       logger.error("Error fetching last document from MongoDB:", error);
  //       throw error;
  //     }
  //   }

  // ... rest of the methods remain the same
  extractSerialNumberFromOCR(ocrData) {
    // Assuming the serial number is a 4-digit number in the OCR data
    // Modify this regex if the format is different
    const match = ocrData.match(/\d{4}/);
    return match ? parseInt(match[0], 10) + 1 : 1; // Start from next number, or 1 if not found
  }

  setResetTime(hour, minute) {
    this.resetHour = hour;
    this.resetMinute = minute;
    logger.info(`Reset time set to ${hour}:${minute}`);
  }

  //   getNextSerialNumber() {
  //     this.checkAndResetSerialNumber();
  //     const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");
  //     this.currentSerialNumber++;
  //     return serialNumber;
  //   }

  //   checkAndResetSerialNumber() {
  //     const now = new Date();
  //     const resetTime = setMinutes(
  //       setHours(now, this.resetHour),
  //       this.resetMinute
  //     );

  //     if (isAfter(now, this.lastResetDate) && isAfter(now, resetTime)) {
  //       this.currentSerialNumber = 1;
  //       this.lastResetDate = now;
  //       logger.info(
  //         `Serial number reset to 0001 at ${format(now, "yyyy-MM-dd HH:mm:ss")}`
  //       );
  //     }
  //   }

  async initialize(dbName, collectionName) {
    if (this.isInitialized) {
      logger.info("SerialNumberGeneratorService already initialized");
      return;
    }

    try {
      // Connect to MongoDB and fetch the last document from records collection
      await MongoDBService.connect(dbName, collectionName);
      const lastDocument = await this.getLastDocumentFromMongoDB();

      // Fetch model config to determine starting serial number
      const modelStartingSerial = await this.getModelStartingSerial();
      logger.info(`Model-based starting serial number: ${modelStartingSerial}`);

      if (lastDocument) {
        // Parse existing serial number and ensure it's at least the model minimum
        const lastSerial = parseInt(lastDocument.SerialNumber, 10);
        if (!isNaN(lastSerial)) {
          this.currentSerialNumber = Math.max(
            lastSerial + 1,
            modelStartingSerial
          );
          logger.info(
            `Found last serial: ${lastSerial}, next will be: ${this.currentSerialNumber}`
          );
        } else {
          this.currentSerialNumber = modelStartingSerial;
          logger.warn(
            `Invalid SerialNumber in last document, using model starting serial: ${modelStartingSerial}`
          );
        }
        this.lastResetDate = new Date(lastDocument.Timestamp);
        logger.info(
          `Initialized serial number to ${this.currentSerialNumber} from last MongoDB document`
        );
      } else {
        this.currentSerialNumber = modelStartingSerial;
        logger.info(
          `No previous documents found, starting with model-based serial number: ${modelStartingSerial}`
        );
      }

      // Check if a reset is needed when initializing
      this.checkAndResetSerialNumber();

      this.isInitialized = true;
    } catch (error) {
      logger.error("Error initializing SerialNumberGeneratorService:", error);
      throw error;
    }
  }

  async getLastDocumentFromMongoDB() {
    try {
      const latestRecord = await MongoDBService.collection
        .find()
        .sort({ Timestamp: -1 })
        .limit(1)
        .toArray();
      return latestRecord[0] || null;
    } catch (error) {
      logger.error("Error fetching last document from MongoDB:", error);
      throw error;
    }
  }

  getNextSerialNumber() {
    this.checkAndResetSerialNumber();
    const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");
    this.currentSerialNumber++;
    return serialNumber;
  }

  async getNextDecSerialNumber2() {
    const reset = this.checkAndResetSerialNumber();

    const lastDocument = await this.getLastDocumentFromMongoDB();
    if (!reset && lastDocument) {
      // Safely parse the serial number with validation
      const lastSerial = lastDocument.SerialNumber;
      let nextSerialNumber;

      if (lastSerial && !isNaN(lastSerial)) {
        // If SerialNumber exists and is a valid number
        nextSerialNumber = parseInt(lastSerial, 10) + 1;

        // Ensure we don't go below the model-based starting serial
        const modelStartingSerial = await this.getModelStartingSerial();
        nextSerialNumber = Math.max(nextSerialNumber, modelStartingSerial);

        logger.info(
          `Found valid SerialNumber: ${lastSerial}, next will be: ${nextSerialNumber}`
        );
      } else {
        // Fallback: use model-based starting serial if SerialNumber is invalid
        nextSerialNumber = await this.getModelStartingSerial();
        logger.warn(
          `Invalid or missing SerialNumber in last document: ${lastSerial}, using model starting serial: ${nextSerialNumber}`
        );
      }

      this.currentSerialNumber = nextSerialNumber;
      this.lastResetDate = new Date(lastDocument.Timestamp);
      logger.info(
        `Initialized serial number to ${this.currentSerialNumber} from MongoDB document`
      );
      return this.currentSerialNumber.toString().padStart(4, "0");
    } else {
      // Reset case or no last document - use model-based starting serial
      if (reset || !lastDocument) {
        const modelStartingSerial = await this.getModelStartingSerial();
        this.currentSerialNumber = modelStartingSerial;
        logger.info(
          `Reset or no document - using model starting serial: ${modelStartingSerial}`
        );
      }

      const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");
      this.currentSerialNumber++;
      logger.info(
        `Using current serial number: ${serialNumber} (reset: ${reset}, hasDocument: ${!!lastDocument})`
      );
      return serialNumber;
    }
  }

  decSerialNumber() {
    // this.checkAndResetSerialNumber();
    // const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");r
    this.currentSerialNumber--;
    return this.currentSerialNumber;
  }

  checkAndResetSerialNumber() {
    const now = new Date();

    // Set resetTime to 6:00 AM today
    const resetTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      this.resetHour,
      this.resetMinute
    );

    console.log({
      now: format(now, "yyyy-MM-dd HH:mm:ss"),
      resetTime: format(resetTime, "yyyy-MM-dd HH:mm:ss"),
      lastResetDate: format(this.lastResetDate, "yyyy-MM-dd HH:mm:ss"),
      isAfterResetTime: isAfter(now, resetTime), // True if now is past 6:00 AM today
      isSameDayAsLastReset: isSameDay(now, this.lastResetDate), // True if last reset was today
      isLastResetBeforeResetTime: isBefore(this.lastResetDate, resetTime), // Check if last reset was before reset time today
    });

    // If it's past the reset time and either:
    // 1. The last reset was on a different day, or
    // 2. The last reset was on the same day but before today's reset time
    if (
      isAfter(now, resetTime) &&
      (!isSameDay(now, this.lastResetDate) ||
        isBefore(this.lastResetDate, resetTime))
    ) {
      this.currentSerialNumber = 1;
      this.lastResetDate = now;
      logger.info(
        `Serial number reset to 0001 at ${format(now, "yyyy-MM-dd HH:mm:ss")}`
      );
      return true;
    }
    return false;
  }

  async getModelStartingSerial() {
    try {
      // Connect to config collection to fetch model information
      await MongoDBService.connect("main-data", "config");
      const configData = await MongoDBService.collection.findOne({});

      if (
        configData &&
        configData.currentModelConfig &&
        configData.currentModelConfig.modelNumber
      ) {
        const modelNumber = configData.currentModelConfig.modelNumber;
        logger.info(`Found model number: ${modelNumber}`);

        // Check if it's CMB-877 model
        if (modelNumber === "CMB-877") {
          logger.info(
            "CMB-877 model detected - starting serial numbers from 7001"
          );
          return 7001;
        } else {
          logger.info(
            `Model ${modelNumber} detected - starting serial numbers from 1`
          );
          return 1;
        }
      } else {
        logger.warn(
          "No model configuration found, defaulting to serial number 1"
        );
        return 1;
      }
    } catch (error) {
      logger.error("Error fetching model configuration:", error);
      logger.warn("Defaulting to serial number 1 due to error");
      return 1;
    }
  }
}

export default new SerialNumberGeneratorService();
