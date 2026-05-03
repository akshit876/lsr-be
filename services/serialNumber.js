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

/** Parse serial stored in Mongo/UI; null if unusable (empty, NaN string, non-numeric). */
function parseStoredSerial(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

class SerialNumberGeneratorService {
  constructor() {
    this.currentSerialNumber = INITIAL_SERIAL_NUMBER;
    this.initialSerialNumber = INITIAL_SERIAL_NUMBER;
    this.resetHour = 0;
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

  /** Coerce in-memory counter to a valid integer (recovers after bad DB reads or NaN poisoning). */
  normalizeCounter() {
    const safeInitial = parseStoredSerial(this.initialSerialNumber);
    if (safeInitial === null) {
      this.initialSerialNumber = INITIAL_SERIAL_NUMBER;
    } else {
      this.initialSerialNumber = safeInitial;
    }
    const safeCurrent = parseStoredSerial(this.currentSerialNumber);
    if (safeCurrent === null) {
      logger.warn(
        `Invalid currentSerialNumber; resetting to initial ${this.initialSerialNumber}`
      );
      this.currentSerialNumber = this.initialSerialNumber;
    } else {
      this.currentSerialNumber = safeCurrent;
    }
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
        const fromConfig = parseStoredSerial(config.initialValue);
        this.initialSerialNumber =
          fromConfig !== null ? fromConfig : INITIAL_SERIAL_NUMBER;
        this.currentSerialNumber = this.initialSerialNumber;
        if (
          config.resetTime &&
          typeof config.resetTime === "string" &&
          config.resetTime.includes(":")
        ) {
          const [h, m] = config.resetTime.split(":");
          this.resetHour = parseInt(h, 10);
          this.resetMinute = parseInt(m, 10);
          if (!Number.isFinite(this.resetHour)) this.resetHour = 0;
          if (!Number.isFinite(this.resetMinute)) this.resetMinute = 0;
        } else {
          this.resetHour = 0;
          this.resetMinute = 0;
        }
        logger.info(
          `Initialized with config - Initial: ${this.initialSerialNumber}, Reset time: ${this.resetHour}:${this.resetMinute}`
        );
      } else {
        logger.info("No configuration found, using default values");
      }

      // Connect to the main collection for serial number tracking
      await MongoDBService.connect(dbName, collectionName);
      const lastDocument = await this.getLastDocumentFromMongoDB();

      const now = new Date();
      const todayResetTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        this.resetHour,
        this.resetMinute
      );

      if (lastDocument) {
        const lastDocumentTime = new Date(lastDocument.Timestamp);

        // Check if the last document was created before today's reset time
        const shouldResetToInitial =
          isAfter(now, todayResetTime) &&
          isBefore(lastDocumentTime, todayResetTime);

        if (shouldResetToInitial) {
          // Reset to initial value because we've passed today's reset time
          this.currentSerialNumber = this.initialSerialNumber;
          this.lastResetDate = todayResetTime;
          logger.info(
            `Reset serial number to ${this.initialSerialNumber} - system started after midnight reset time`
          );
        } else {
          const lastSerial = parseStoredSerial(lastDocument.SerialNumber);
          if (lastSerial !== null) {
            this.currentSerialNumber = lastSerial + 1;
            this.lastResetDate = lastDocumentTime;
            logger.info(
              `Continuing serial number from ${this.currentSerialNumber} based on last MongoDB document`
            );
          } else {
            logger.warn(
              "Latest MongoDB record has missing or non-numeric SerialNumber; starting from configured initial"
            );
            this.currentSerialNumber = this.initialSerialNumber;
            this.lastResetDate = lastDocumentTime;
          }
        }
      } else {
        // No previous records, start with initial value
        this.lastResetDate = new Date(
          todayResetTime.getTime() - 24 * 60 * 60 * 1000
        ); // Previous day
        logger.info(
          "No previous records found, starting with initial serial number"
        );
      }

      // Final check for any needed reset
      this.checkAndResetSerialNumber();
      this.normalizeCounter();

      this.isInitialized = true;
    } catch (error) {
      logger.error("Error initializing SerialNumberGeneratorService:", error);
      throw error;
    }
  }

  async getLastDocumentFromMongoDB() {
    try {
      const batch = await MongoDBService.collection
        .find()
        .sort({ Timestamp: -1 })
        .limit(50)
        .toArray();
      for (const doc of batch) {
        if (parseStoredSerial(doc?.SerialNumber) !== null) return doc;
      }
      return null;
    } catch (error) {
      logger.error("Error fetching last document from MongoDB:", error);
      throw error;
    }
  }

  getNextSerialNumber() {
    this.checkAndResetSerialNumber();
    this.normalizeCounter();
    const serialNumber = this.currentSerialNumber.toString().padStart(3, "0");
    this.currentSerialNumber++;
    return serialNumber;
  }

  async getNextDecSerialNumber2() {
    const reset = this.checkAndResetSerialNumber();
    this.normalizeCounter();
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
      const serialNumber = this.currentSerialNumber.toString().padStart(3, "0");
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
      const lastSerial = parseStoredSerial(lastDocument.SerialNumber);
      if (lastSerial !== null) {
        this.currentSerialNumber = lastSerial + 1;
        this.lastResetDate = new Date(lastDocument.Timestamp);
        logger.info(
          `Initialized serial number to ${this.currentSerialNumber} from last MongoDB document`
        );
      } else {
        logger.warn(
          "Latest MongoDB document has invalid SerialNumber; not advancing counter from DB (using in-memory value)"
        );
      }
    }

    const serialNumber = this.currentSerialNumber.toString().padStart(3, "0");
    this.currentSerialNumber++;
    return serialNumber;
  }

  incrementSerialNumber() {
    this.normalizeCounter();
    this.currentSerialNumber++;
    return this.currentSerialNumber.toString().padStart(3, "0"); // Format the return value with leading zeros
  }

  decSerialNumber() {
    this.normalizeCounter();
    this.currentSerialNumber--;
    return this.currentSerialNumber.toString().padStart(3, "0");
  }

  checkAndResetSerialNumber() {
    const now = new Date();
    const resetTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      this.resetHour,
      this.resetMinute
    );

    // If current time is before reset time, set reset time to previous day
    if (
      now.getHours() < this.resetHour ||
      (now.getHours() === this.resetHour && now.getMinutes() < this.resetMinute)
    ) {
      resetTime.setDate(resetTime.getDate() - 1);
    }

    // Initialize lastResetDate if not set
    if (!this.lastResetDate) {
      this.lastResetDate = new Date(resetTime.getTime() - 24 * 60 * 60 * 1000); // Previous day
    }

    // Check if we need to reset based on time (daily reset at midnight)
    const shouldResetByTime =
      isAfter(now, resetTime) &&
      (!isSameDay(now, this.lastResetDate) ||
        isBefore(this.lastResetDate, resetTime));

    // Check if we need to reset based on reaching 999 (wrap-around)
    const shouldResetByCount = this.currentSerialNumber > 999;

    if (shouldResetByTime || shouldResetByCount) {
      this.currentSerialNumber = this.initialSerialNumber;
      this.lastResetDate = now;

      const resetReason = shouldResetByTime
        ? "daily reset at midnight"
        : "reaching 999";
      logger.info(
        `Serial number reset to ${this.initialSerialNumber.toString().padStart(3, "0")} due to ${resetReason} at ${format(now, "yyyy-MM-dd HH:mm:ss")}`
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
      const parsed = parseStoredSerial(resetValue);
      if (parsed === null) {
        throw new Error("Invalid reset value: must be a non-negative integer");
      }
      this.currentSerialNumber = parsed;
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

      const nextInitial = parseStoredSerial(config.initialValue);
      const nextCurrent = parseStoredSerial(config.currentValue);
      this.initialSerialNumber =
        nextInitial !== null ? nextInitial : INITIAL_SERIAL_NUMBER;
      this.currentSerialNumber =
        nextCurrent !== null ? nextCurrent : this.initialSerialNumber;
      this.normalizeCounter();

      logger.info("Serial number configuration updated successfully");
      return true;
    } catch (error) {
      logger.error("Error updating serial number configuration:", error);
      throw error;
    }
  }
}

export default new SerialNumberGeneratorService();
