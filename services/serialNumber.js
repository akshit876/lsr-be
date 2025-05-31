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
    this.currentModelNumber = null; // Track current model for separate sequences
    this.modelStartingSerials = {
      "CMB-877": 7001,
      default: 1,
    };
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
      // Store the original database and collection names for later restoration
      this.originalDbName = dbName;
      this.originalCollectionName = collectionName;

      // First, fetch reset time configuration from MongoDB
      await this.getResetTimeFromConfig();

      // Load model-specific serial configuration (priority #1)
      const modelConfig = await this.loadModelSerialConfig();
      
      // Get model-based starting serial
      const modelStartingSerial = await this.getModelStartingSerial();
      logger.info(`Model-based starting serial number: ${modelStartingSerial}`);

      // If we have model-specific config, use it
      if (modelConfig && modelConfig.currentValue) {
        this.currentSerialNumber = parseInt(modelConfig.currentValue, 10);
        logger.info(`Using model-specific serial number: ${this.currentSerialNumber}`);
      } else {
        // Fallback: Connect to MongoDB and fetch the last document from records collection
        await MongoDBService.connect(dbName, collectionName);
        const lastDocument = await this.getLastDocumentFromMongoDB();

        // IMPORTANT: Restore connection to the original records collection
        // because other methods might have changed the connection
        await MongoDBService.connect(
          this.originalDbName,
          this.originalCollectionName
        );
        logger.info(
          `Restored connection to ${this.originalDbName}.${this.originalCollectionName}`
        );

        if (lastDocument) {
          // Parse existing serial number and ensure it's at least the model minimum
          const lastSerial = parseInt(lastDocument.SerialNumber, 10);
          if (!isNaN(lastSerial)) {
            this.currentSerialNumber = Math.max(
              lastSerial + 1,
              modelStartingSerial
            );
            logger.info(
              `Found last serial from records: ${lastSerial}, next will be: ${this.currentSerialNumber}`
            );
          } else {
            this.currentSerialNumber = modelStartingSerial;
            logger.warn(
              `Invalid SerialNumber in last document, using model starting serial: ${modelStartingSerial}`
            );
          }
          this.lastResetDate = new Date(lastDocument.Timestamp);

          // Validate the date and fallback if invalid
          if (isNaN(this.lastResetDate.getTime())) {
            logger.warn("Invalid Timestamp in last document, using current date");
            this.lastResetDate = new Date();
          }

          logger.info(
            `Initialized serial number to ${this.currentSerialNumber} from MongoDB records`
          );
        } else {
          this.currentSerialNumber = modelStartingSerial;
          // Set lastResetDate to current date if no documents
          this.lastResetDate = new Date();
          logger.info(
            `No previous documents found, starting with model-based serial number: ${modelStartingSerial}`
          );
        }
      }

      // Check if a reset is needed when initializing
      await this.checkAndResetSerialNumber();

      this.isInitialized = true;
    } catch (error) {
      logger.error("Error initializing SerialNumberGeneratorService:", error);
      throw error;
    }
  }

  async getLastDocumentFromMongoDB() {
    try {
      // Get current model number to filter documents
      const currentModel = await this.getCurrentModelNumber();

      // Build query filter for current model
      const query = currentModel ? { ModelNumber: currentModel } : {};

      logger.info(
        `🔍 Searching for last document with model: ${currentModel || "any"}`
      );

      const latestRecord = await MongoDBService.collection
        .find(query)
        .sort({ Timestamp: -1 })
        .limit(1)
        .toArray();

      const lastDocument = latestRecord[0] || null;

      // Debug logging to see what's actually in the database
      if (lastDocument) {
        logger.info("🔍 Debug - Last document from MongoDB for current model:");
        logger.info(`  Model: ${lastDocument.ModelNumber || "not set"}`);
        logger.info(`  Document ID: ${lastDocument._id}`);
        logger.info(
          `  SerialNumber: ${lastDocument.SerialNumber} (type: ${typeof lastDocument.SerialNumber})`
        );
        logger.info(
          `  Timestamp: ${lastDocument.Timestamp} (type: ${typeof lastDocument.Timestamp})`
        );
      } else {
        logger.info(
          `🔍 Debug - No documents found for model: ${currentModel || "any"}`
        );

        // Check if collection exists and has any documents at all
        const totalCount = await MongoDBService.collection.countDocuments({});
        logger.info(`  Total document count: ${totalCount}`);

        if (totalCount > 0) {
          // Get any document to see the structure
          const anyDocument = await MongoDBService.collection.findOne({});
          logger.info(
            `  Sample document structure: ${JSON.stringify(Object.keys(anyDocument))}`
          );
        }
      }

      return lastDocument;
    } catch (error) {
      logger.error("Error fetching last document from MongoDB:", error);
      throw error;
    }
  }

  async getNextSerialNumber() {
    await this.checkAndResetSerialNumber();
    const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");
    this.currentSerialNumber++;
    return serialNumber;
  }

  async getNextDecSerialNumber2() {
    const reset = await this.checkAndResetSerialNumber();

    // Ensure we're connected to the correct records collection before fetching
    if (this.originalDbName && this.originalCollectionName) {
      await MongoDBService.connect(
        this.originalDbName,
        this.originalCollectionName
      );
      logger.info(
        `Connected to ${this.originalDbName}.${this.originalCollectionName} for getNextDecSerialNumber2`
      );
    }

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

        // Restore connection after getting model config
        if (this.originalDbName && this.originalCollectionName) {
          await MongoDBService.connect(
            this.originalDbName,
            this.originalCollectionName
          );
        }

        nextSerialNumber = Math.max(nextSerialNumber, modelStartingSerial);

        logger.info(
          `Found valid SerialNumber: ${lastSerial}, next will be: ${nextSerialNumber}`
        );
      } else {
        // Fallback: use model-based starting serial if SerialNumber is invalid
        nextSerialNumber = await this.getModelStartingSerial();

        // Restore connection after getting model config
        if (this.originalDbName && this.originalCollectionName) {
          await MongoDBService.connect(
            this.originalDbName,
            this.originalCollectionName
          );
        }

        logger.warn(
          `Invalid or missing SerialNumber in last document: ${lastSerial}, using model starting serial: ${nextSerialNumber}`
        );
      }

      this.currentSerialNumber = nextSerialNumber;
      this.lastResetDate = new Date(lastDocument.Timestamp);

      // Validate the date and fallback if invalid
      if (isNaN(this.lastResetDate.getTime())) {
        logger.warn("Invalid Timestamp in last document, using current date");
        this.lastResetDate = new Date();
      }

      logger.info(
        `Initialized serial number to ${this.currentSerialNumber} from MongoDB document`
      );
      return this.currentSerialNumber.toString().padStart(4, "0");
    } else {
      // Reset case or no last document - use model-based starting serial
      if (reset || !lastDocument) {
        const modelStartingSerial = await this.getModelStartingSerial();

        // Restore connection after getting model config
        if (this.originalDbName && this.originalCollectionName) {
          await MongoDBService.connect(
            this.originalDbName,
            this.originalCollectionName
          );
        }

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

  async checkAndResetSerialNumber() {
    const now = new Date();

    // Ensure lastResetDate is valid, fallback to current date if not
    if (!this.lastResetDate || isNaN(this.lastResetDate.getTime())) {
      logger.warn("Invalid lastResetDate detected, resetting to current date");
      this.lastResetDate = new Date();
    }

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
      // Get model-based starting serial for reset
      const modelStartingSerial = await this.getModelStartingSerial();
      this.currentSerialNumber = modelStartingSerial;
      this.lastResetDate = now;

      // Update the serialNoconfig collection with the reset information
      await this.updateSerialConfigOnReset();

      logger.info(
        `Serial number reset to ${modelStartingSerial.toString().padStart(4, "0")} at ${format(now, "yyyy-MM-dd HH:mm:ss")}`
      );
      return true;
    }
    return false;
  }

  async getModelStartingSerial() {
    try {
      // Get current model number
      const modelNumber = await this.getCurrentModelNumber();

      if (modelNumber) {
        const startingSerial =
          this.modelStartingSerials[modelNumber] ||
          this.modelStartingSerials["default"];
        logger.info(`Model ${modelNumber} starting serial: ${startingSerial}`);
        return startingSerial;
      } else {
        logger.warn("No model number found, using default starting serial");
        return this.modelStartingSerials["default"];
      }
    } catch (error) {
      logger.error("Error fetching model starting serial:", error);
      logger.warn("Defaulting to serial number 1 due to error");
      return this.modelStartingSerials["default"];
    }
  }

  async getResetTimeFromConfig() {
    try {
      // Connect to serialNoconfig collection to fetch reset time configuration
      await MongoDBService.connect("main-data", "serialNoconfig");
      const serialConfig = await MongoDBService.collection.findOne({});

      if (serialConfig && serialConfig.resetTime) {
        // Parse the resetTime format "06:00" into hour and minute
        const [hour, minute] = serialConfig.resetTime.split(":").map(Number);
        logger.info(
          `Found serial number reset configuration: ${serialConfig.resetTime}, interval: ${serialConfig.resetInterval}`
        );

        // Only apply if reset is enabled (daily interval)
        if (serialConfig.resetInterval === "daily") {
          this.resetHour = hour || 6;
          this.resetMinute = minute || 0;
          logger.info(
            `Reset time updated from serialNoconfig: ${this.resetHour}:${this.resetMinute}`
          );
        } else {
          logger.info(
            `Reset interval is '${serialConfig.resetInterval}', using default reset time`
          );
          this.resetHour = 6;
          this.resetMinute = 0;
        }

        // Update lastResetDate if available
        if (serialConfig.lastReset) {
          this.lastResetDate = new Date(serialConfig.lastReset);
          logger.info(`Last reset date loaded: ${this.lastResetDate}`);
        }
      } else {
        logger.warn(
          "No serial number reset configuration found, using defaults (6:00)"
        );
        this.resetHour = 6;
        this.resetMinute = 0;
      }
    } catch (error) {
      logger.error("Error fetching serial number reset configuration:", error);
      logger.warn("Using default reset time (6:00) due to error");
      this.resetHour = 6;
      this.resetMinute = 0;
    }
  }

  async updateSerialConfigOnReset() {
    try {
      const modelNumber = this.currentModelNumber || "default";

      // Connect to a new collection for model-wise serial tracking
      await MongoDBService.connect("main-data", "modelSerialConfig");

      // Update or create model-specific serial configuration
      const updateData = {
        modelNumber: modelNumber,
        currentValue: this.currentSerialNumber.toString(),
        lastReset: new Date(),
        startingSerial:
          this.modelStartingSerials[modelNumber] ||
          this.modelStartingSerials["default"],
        updatedAt: new Date(),
      };

      // Upsert the model-specific configuration
      await MongoDBService.collection.updateOne(
        { modelNumber: modelNumber },
        { $set: updateData },
        { upsert: true }
      );

      logger.info(
        `Model-wise serial reset updated: Model=${modelNumber}, currentValue=${updateData.currentValue}, startingSerial=${updateData.startingSerial}`
      );

      // Also update the global serialNoconfig for backward compatibility
      await MongoDBService.connect("main-data", "serialNoconfig");
      const serialConfig = await MongoDBService.collection.findOne({});

      if (serialConfig && serialConfig.resetInterval === "daily") {
        await MongoDBService.collection.updateOne(
          {},
          {
            $set: {
              currentValue: this.currentSerialNumber.toString(),
              lastReset: new Date(),
            },
          }
        );
        logger.info("Global serialNoconfig also updated for compatibility");
      }
    } catch (error) {
      logger.error(
        "Error updating model-wise serial reset configuration:",
        error
      );
      throw error;
    }
  }

  async getCurrentModelNumber() {
    try {
      // Connect to config collection to fetch current model
      await MongoDBService.connect("main-data", "config");
      const configData = await MongoDBService.collection.findOne({});

      if (
        configData &&
        configData.currentModelConfig &&
        configData.currentModelConfig.modelNumber
      ) {
        this.currentModelNumber = configData.currentModelConfig.modelNumber;
        logger.info(`Current model number: ${this.currentModelNumber}`);
        return this.currentModelNumber;
      } else {
        logger.warn("No model configuration found, using null");
        this.currentModelNumber = null;
        return null;
      }
    } catch (error) {
      logger.error("Error fetching current model number:", error);
      this.currentModelNumber = null;
      return null;
    }
  }

  async loadModelSerialConfig() {
    try {
      const modelNumber = await this.getCurrentModelNumber();

      // Connect to model-wise serial tracking collection
      await MongoDBService.connect("main-data", "modelSerialConfig");
      const modelConfig = await MongoDBService.collection.findOne({
        modelNumber: modelNumber || "default",
      });

      if (modelConfig) {
        logger.info(
          `Found model-specific serial config for ${modelNumber}: currentValue=${modelConfig.currentValue}, lastReset=${modelConfig.lastReset}`
        );

        // Load the current serial number and last reset date for this model
        this.currentSerialNumber =
          parseInt(modelConfig.currentValue, 10) ||
          this.getModelStartingSerial();
        if (modelConfig.lastReset) {
          this.lastResetDate = new Date(modelConfig.lastReset);
        }

        return modelConfig;
      } else {
        logger.info(
          `No model-specific config found for ${modelNumber}, will create on first reset`
        );
        return null;
      }
    } catch (error) {
      logger.error("Error loading model-wise serial configuration:", error);
      return null;
    }
  }
}

export default new SerialNumberGeneratorService();
