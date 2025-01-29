import { format, isAfter, isBefore, isSameDay } from "date-fns";
import logger from "../logger.js";
import MongoDBService from "./mongoDbService.js";
import path, { dirname } from "path";
// import { __dirname } from "./scanCycles.js";
import fs from "fs";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);
const INITIAL_SERIAL_NUMBER = 1; // Default value

class SerialNumberGeneratorService {
  constructor() {
    this.currentSerialNumber = INITIAL_SERIAL_NUMBER;
    this.initialSerialNumber = INITIAL_SERIAL_NUMBER;
    this.resetHour = 6;
    this.resetMinute = 0;
    this.isInitialized = false;
    this.isManualReset = false;
    this.hasResetEventOccurred = false;
  }

  // Add new method to update initial serial number
  updateInitialSerialNumber(newValue) {
    try {
      const parsedValue = parseInt(newValue, 10);
      if (isNaN(parsedValue) || parsedValue < 0) {
        throw new Error("Invalid serial number value");
      }

      this.initialSerialNumber = parsedValue;
      this.currentSerialNumber = parsedValue; // Update current number as well

      logger.info(`Initial serial number updated to ${parsedValue}`);
      return true;
    } catch (error) {
      logger.error("Error updating initial serial number:", error);
      throw error;
    }
  }

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

  async initialize(dbName, collectionName) {
    if (this.isInitialized) {
      logger.info("SerialNumberGeneratorService already initialized");
      return;
    }

    try {
      // Connect to MongoDB and fetch configurations
      await MongoDBService.connect("main-data", "serialNoconfig");
      const config = await MongoDBService.collection.findOne({});

      if (config) {
        this.initialSerialNumber = parseInt(config.initialValue, 10);
        this.currentSerialNumber = parseInt(config.initialValue, 10);
        this.resetHour = config.resetTime.split(":")[0];
        this.resetMinute = config.resetTime.split(":")[1];
        logger.info(
          `Initialized with config - Initial: ${this.initialSerialNumber}, Current: ${this.currentSerialNumber}`
        );
      } else {
        logger.info("No configuration found, using default values");
      }

      // Connect to the main collection for serial number tracking
      await MongoDBService.connect(dbName, collectionName);
      const lastDocument = await this.getLastDocumentFromMongoDB();

      if (lastDocument) {
        this.currentSerialNumber = parseInt(lastDocument.SerialNumber, 10) + 1;
        this.lastResetDate = new Date(lastDocument.Timestamp);
        logger.info(
          `Updated serial number to ${this.currentSerialNumber} from last MongoDB document`
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
    const now = new Date();
    const resetTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      this.resetHour,
      this.resetMinute
    );

    // Check if this is the first call after manual reset
    if (this.isManualReset || this.hasResetEventOccurred) {
      this.isManualReset = false;
      this.hasResetEventOccurred = false; // Reset the flag after use
      const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");
      this.currentSerialNumber++;
      return serialNumber;
    }

    // Regular flow - only execute if no reset event has occurred
    const lastDocument = await this.getLastDocumentFromMongoDB();

    if (
      !reset &&
      lastDocument &&
      isAfter(new Date(lastDocument.Timestamp), resetTime)
    ) {
      this.currentSerialNumber = parseInt(lastDocument.SerialNumber, 10) + 1;
      this.lastResetDate = new Date(lastDocument.Timestamp);
      logger.info(
        `Initialized serial number to ${this.currentSerialNumber} from last MongoDB document`
      );
    }

    const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");
    this.currentSerialNumber++;
    return serialNumber;
  }

  incrementSerialNumber() {
    this.currentSerialNumber++;
    return this.currentSerialNumber.toString().padStart(4, '0'); // Format the return value with leading zeros
  }

  decSerialNumber() {
    // this.checkAndResetSerialNumber();
    // const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");r
    this.currentSerialNumber--;
    return this.currentSerialNumber.toString().padStart(4, '0'); // Format the return value with leading zeros
  }

  checkAndResetSerialNumber() {
    // const now = new Date();
    // const resetTime = new Date(
    //   now.getFullYear(),
    //   now.getMonth(),
    //   now.getDate(),
    //   this.resetHour,
    //   this.resetMinute
    // );

    // // console.log({
    // //   now: format(now, "yyyy-MM-dd HH:mm:ss"),
    // //   resetTime: format(resetTime, "yyyy-MM-dd HH:mm:ss"),
    // //   lastResetDate: format(this.lastResetDate, "yyyy-MM-dd HH:mm:ss"),
    // //   isAfterResetTime: isAfter(now, resetTime),
    // //   isSameDayAsLastReset: isSameDay(now, this.lastResetDate),
    // //   isLastResetBeforeResetTime: isBefore(this.lastResetDate, resetTime),
    // // });

    // if (
    //   isAfter(now, resetTime) &&
    //   (!isSameDay(now, this.lastResetDate) ||
    //     isBefore(this.lastResetDate, resetTime))
    // ) {
    //   this.currentSerialNumber = this.initialSerialNumber; // Use tracked initial value
    //   this.lastResetDate = now;
    //   logger.info(
    //     `Serial number reset to ${this.initialSerialNumber.toString().padStart(4, "0")} at ${format(now, "yyyy-MM-dd HH:mm:ss")}`
    //   );
    //   return true;
    // }
    // return false;
    if (this.currentSerialNumber >= 9999) {
      this.currentSerialNumber = this.initialSerialNumber;
      this.lastResetDate = new Date();
      logger.info(
        `Serial number reset to ${this.initialSerialNumber.toString().padStart(4, "0")} after reaching 9999`
      );
      return true;
    }
    return false;
  }

  // Modified method to accept reset value
  // async manualSerialNumberReset() {
  //   try {
  //     // First fetch the latest config from MongoDB
  //     await MongoDBService.connect("main-data", "serialNoconfig");
  //     const config = await MongoDBService.collection.findOne({});

  //     if (!config || !config.resetValue) {
  //       throw new Error("Reset value not found in configuration");
  //     }

  //     const resetValue = parseInt(config.resetValue, 10);
  //     if (isNaN(resetValue) || resetValue < 0) {
  //       throw new Error("Invalid reset value in configuration");
  //     }

  //     this.currentSerialNumber = resetValue;
  //     this.lastResetDate = new Date();
  //     this.isManualReset = true; // Set flag when manual reset occurs
  //     this.hasResetEventOccurred = true; // Set the flag when reset occurs

  //     logger.info(
  //       `Serial number manually reset to ${resetValue.toString().padStart(4, "0")} at ${format(
  //         this.lastResetDate,
  //         "yyyy-MM-dd HH:mm:ss"
  //       )}`
  //     );

  //     return {
  //       success: true,
  //       currentValue: this.currentSerialNumber,
  //       resetTime: this.lastResetDate,
  //     };
  //   } catch (error) {
  //     logger.error("Error during manual serial number reset:", error);
  //     throw error;
  //   }
  // }

  async manualSerialNumberReset(resetValue) {
    try {
      // Use the resetValue passed from frontend instead of fetching from DB
      this.currentSerialNumber = parseInt(resetValue, 10);
      this.lastResetDate = new Date();
      this.isManualReset = true;
      this.hasResetEventOccurred = true;

      return {
        currentValue: this.currentSerialNumber,
        resetTime: this.lastResetDate,
      };
    } catch (error) {
      logger.error("Error during manual serial number reset:", error);
      throw error;
    }
  }

  async updateConfiguration(config) {
    try {
      await MongoDBService.connect("main-data", "serialNoconfig");
      await MongoDBService.collection.updateOne(
        {}, // Update first document
        {
          $set: {
            currentValue: config.currentValue?.toString() || "0",
            initialValue: config.initialValue?.toString() || "0",
            resetInterval: config.resetInterval || "daily",
            resetValue: config.resetValue?.toString() || "0",
            updatedAt: new Date().toISOString(),
            updatedBy: config.updatedBy || "system",
          },
        },
        { upsert: true }
      );

      // Update local values
      this.initialSerialNumber = parseInt(config.initialValue, 10);
      this.currentSerialNumber = parseInt(config.currentValue, 10);

      logger.info("Serial number configuration updated successfully");
      return true;
    } catch (error) {
      logger.error("Error updating serial number configuration:", error);
      throw error;
    }
  }
}

export default new SerialNumberGeneratorService();
