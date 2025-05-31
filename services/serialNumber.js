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

      // PRIORITY: Always use modelSerialConfig as the primary source
      logger.info(
        "🔍 Loading serial configuration from modelSerialConfig (primary database)..."
      );
      const modelConfig = await this.loadModelSerialConfig();

      // Get model-based starting serial
      const modelStartingSerial = await this.getModelStartingSerial();
      logger.info(`Model-based starting serial number: ${modelStartingSerial}`);

      // If we have model-specific config, use it (this is the normal case)
      if (modelConfig && modelConfig.currentValue) {
        logger.info(`✅ Using modelSerialConfig as primary source`);
        // currentSerialNumber is already set in loadModelSerialConfig()
      } else {
        // No model config exists yet - start with model's starting serial
        logger.info(
          `🆕 No modelSerialConfig found for current model, creating new entry with starting serial: ${modelStartingSerial}`
        );
        this.currentSerialNumber = modelStartingSerial;
        this.lastResetDate = new Date();

        // Save this initial configuration to modelSerialConfig
        await this.saveUsedSerialNumber(this.currentSerialNumber - 1); // Save starting serial - 1 so next call returns starting serial
      }

      // Check if a reset is needed when initializing
      await this.checkAndResetSerialNumber();

      this.isInitialized = true;
      logger.info(
        `✅ SerialNumberGeneratorService initialized with serial: ${this.currentSerialNumber} (using modelSerialConfig)`
      );
    } catch (error) {
      logger.error("Error initializing SerialNumberGeneratorService:", error);
      throw error;
    }
  }

  async getLastDocumentFromMongoDB() {
    try {
      // NOTE: This method is only used for records collection queries, not for serial number logic
      // Serial number logic now uses modelSerialConfig as the primary source

      // Get current model number to filter documents
      const currentModel = await this.getCurrentModelNumber();

      // Build query filter for current model
      const query = currentModel ? { ModelNumber: currentModel } : {};

      logger.info(
        `🔍 Searching for last document in records collection with model: ${currentModel || "any"}`
      );

      const latestRecord = await MongoDBService.collection
        .find(query)
        .sort({ Timestamp: -1 })
        .limit(1)
        .toArray();

      const lastDocument = latestRecord[0] || null;

      // Debug logging to see what's actually in the database
      if (lastDocument) {
        logger.info(
          "🔍 Debug - Last document from records collection for current model:"
        );
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
          `🔍 Debug - No records found for model: ${currentModel || "any"}`
        );

        // Check if collection exists and has any documents at all
        const totalCount = await MongoDBService.collection.countDocuments({});
        logger.info(`  Total record count: ${totalCount}`);

        if (totalCount > 0) {
          // Get any document to see the structure
          const anyDocument = await MongoDBService.collection.findOne({});
          logger.info(
            `  Sample record structure: ${JSON.stringify(Object.keys(anyDocument))}`
          );
        }
      }

      return lastDocument;
    } catch (error) {
      logger.error(
        "Error fetching last document from records collection:",
        error
      );
      throw error;
    }
  }

  async getNextSerialNumber() {
    await this.checkAndResetSerialNumber();
    const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");

    // Save the USED serial number to model-wise configuration
    await this.saveUsedSerialNumber(this.currentSerialNumber);

    this.currentSerialNumber++;

    return serialNumber;
  }

  async getNextDecSerialNumber2() {
    const reset = await this.checkAndResetSerialNumber();

    // IMPORTANT: Always check if the model has changed and reload config from modelSerialConfig
    const currentModelFromDB = await this.getCurrentModelNumber();

    // If model has changed, reload the model-specific serial configuration from modelSerialConfig
    if (this.currentModelNumber !== currentModelFromDB) {
      logger.info(
        `🔄 Model changed from ${this.currentModelNumber} to ${currentModelFromDB}, reloading from modelSerialConfig...`
      );

      this.currentModelNumber = currentModelFromDB;

      // Load model-specific serial configuration from modelSerialConfig
      const modelConfig = await this.loadModelSerialConfig();

      // Get the correct starting serial for this model
      const modelStartingSerial = await this.getModelStartingSerial();

      // If no model config exists in modelSerialConfig, start with the model's starting serial
      if (!modelConfig || !modelConfig.currentValue) {
        this.currentSerialNumber = modelStartingSerial;
        logger.info(
          `🆕 New model in modelSerialConfig, starting with serial: ${modelStartingSerial}`
        );
      } else {
        // Model config exists in modelSerialConfig - always continue from currentValue + 1 (except during reset)
        const existingValue = parseInt(modelConfig.currentValue, 10);
        if (!isNaN(existingValue)) {
          this.currentSerialNumber = existingValue + 1;
          logger.info(
            `✅ Model ${currentModelFromDB} continuing from modelSerialConfig value ${existingValue} to ${this.currentSerialNumber}`
          );
        } else {
          this.currentSerialNumber = modelStartingSerial;
          logger.warn(
            `⚠️ Invalid currentValue in modelSerialConfig, using starting serial: ${modelStartingSerial}`
          );
        }
      }
    }

    // If a reset happened, the currentSerialNumber was already set to the model starting serial
    if (reset) {
      const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");

      // Save the USED serial number to modelSerialConfig
      await this.saveUsedSerialNumber(this.currentSerialNumber);

      this.currentSerialNumber++;

      logger.info(
        `Using reset serial number: ${serialNumber} for model: ${this.currentModelNumber} (saved to modelSerialConfig)`
      );
      return serialNumber;
    }

    // For normal operation, use the current serial number from modelSerialConfig
    const serialNumber = this.currentSerialNumber.toString().padStart(4, "0");

    // Save the USED serial number to modelSerialConfig
    await this.saveUsedSerialNumber(this.currentSerialNumber);

    // Increment for next call
    this.currentSerialNumber++;

    logger.info(
      `Using current serial number: ${serialNumber} for model: ${this.currentModelNumber} (next will be: ${this.currentSerialNumber}) - saved to modelSerialConfig`
    );
    return serialNumber;
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
      // Always get fresh model number from database
      const modelNumber = await this.getCurrentModelNumber();

      if (modelNumber) {
        // Check if it's a CMB model and extract the number
        if (modelNumber.startsWith("CMB-")) {
          const modelNumericPart = modelNumber.replace("CMB-", "");
          const numericValue = parseInt(modelNumericPart, 10);

          if (!isNaN(numericValue)) {
            // For CMB models, use the numeric part * 1000 + 1 as starting serial
            // Example: CMB-778 → 778001, CMB-877 → 877001
            const startingSerial = numericValue * 1000 + 1;
            logger.info(
              `CMB model ${modelNumber} starting serial: ${startingSerial}`
            );
            return startingSerial;
          } else {
            logger.warn(
              `Invalid CMB model number format: ${modelNumber}, using default`
            );
            return this.modelStartingSerials["default"];
          }
        }

        // Check for specific model configurations
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

      // Get the correct starting serial using our dynamic calculation
      const dynamicStartingSerial = await this.getModelStartingSerial();

      // Update or create model-specific serial configuration
      const updateData = {
        modelNumber: modelNumber,
        currentValue: this.currentSerialNumber.toString(),
        lastReset: new Date(),
        startingSerial: dynamicStartingSerial, // Use dynamic calculation
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

      logger.info(
        `🔍 Loading model serial config for: ${modelNumber || "default"}`
      );

      // Connect to model-wise serial tracking collection
      await MongoDBService.connect("main-data", "modelSerialConfig");
      logger.info("✅ Connected to main-data.modelSerialConfig collection");

      // Check if collection exists and has documents
      const totalDocs = await MongoDBService.collection.countDocuments({});
      logger.info(`📊 Total documents in modelSerialConfig: ${totalDocs}`);

      const modelConfig = await MongoDBService.collection.findOne({
        modelNumber: modelNumber || "default",
      });

      if (modelConfig) {
        logger.info(
          `✅ Found model-specific serial config for ${modelNumber}:`
        );
        logger.info(`   currentValue: ${modelConfig.currentValue}`);
        logger.info(`   lastReset: ${modelConfig.lastReset}`);
        logger.info(`   lastUpdated: ${modelConfig.lastUpdated}`);

        // Set the NEXT serial number (current + 1) since currentValue is the last used
        const lastUsedSerial = parseInt(modelConfig.currentValue, 10);
        if (!isNaN(lastUsedSerial)) {
          this.currentSerialNumber = lastUsedSerial + 1;
          logger.info(
            `🎯 Setting next serial number to: ${this.currentSerialNumber} (last used: ${lastUsedSerial})`
          );
        } else {
          this.currentSerialNumber = await this.getModelStartingSerial();
          logger.warn(
            `⚠️ Invalid currentValue in model config, using starting serial: ${this.currentSerialNumber}`
          );
        }

        // Load last reset date if available
        if (modelConfig.lastReset) {
          this.lastResetDate = new Date(modelConfig.lastReset);
          logger.info(`📅 Loaded last reset date: ${this.lastResetDate}`);
        }

        return modelConfig;
      } else {
        logger.info(
          `ℹ️ No model-specific config found for ${modelNumber}, will create on first use`
        );

        // List all documents to see what's there
        const allDocs = await MongoDBService.collection.find({}).toArray();
        logger.info(
          `📋 Available model configs: ${allDocs.map((doc) => doc.modelNumber).join(", ")}`
        );

        return null;
      }
    } catch (error) {
      logger.error("❌ Error loading model-wise serial configuration:", error);
      return null;
    }
  }

  async saveUsedSerialNumber(usedSerialNumber) {
    try {
      const modelNumber =
        this.currentModelNumber ||
        (await this.getCurrentModelNumber()) ||
        "default";

      logger.info(
        `🔍 Saving used serial number: ${usedSerialNumber} for model: ${modelNumber}`
      );

      // Connect to model-wise serial tracking collection
      await MongoDBService.connect("main-data", "modelSerialConfig");
      logger.info("✅ Connected to main-data.modelSerialConfig collection");

      // Get the correct starting serial using our dynamic calculation
      const dynamicStartingSerial = await this.getModelStartingSerial();

      // Update or create model-specific serial configuration with the USED serial number
      const updateData = {
        modelNumber: modelNumber,
        currentValue: usedSerialNumber.toString(), // Last used, not next
        lastUpdated: new Date(),
        startingSerial: dynamicStartingSerial, // Use dynamic calculation
      };

      logger.info(`📝 Upserting data: ${JSON.stringify(updateData)}`);

      // Upsert the model-specific configuration
      const result = await MongoDBService.collection.updateOne(
        { modelNumber: modelNumber },
        { $set: updateData },
        { upsert: true }
      );

      logger.info(
        `✅ Upsert result: matched=${result.matchedCount}, modified=${result.modifiedCount}, upserted=${result.upsertedCount}`
      );

      if (result.upsertedCount > 0) {
        logger.info(`🆕 Created new model serial config for: ${modelNumber}`);
      } else {
        logger.info(
          `📋 Updated existing model serial config for: ${modelNumber}`
        );
      }

      logger.info(
        `Model-wise serial number saved: Model=${modelNumber}, lastUsed=${updateData.currentValue}, startingSerial=${updateData.startingSerial}`
      );
    } catch (error) {
      logger.error("❌ Error saving used serial number:", error);
      throw error;
    }
  }

  async saveCurrentSerialNumber() {
    // We don't need this method since we're using the records collection
    // for tracking model-wise serial numbers
    logger.info("Serial number tracking handled through records collection");
  }

  // Utility method to fix existing model serial configurations with correct starting serials
  async fixModelSerialConfigurations() {
    try {
      logger.info("🔧 Fixing existing model serial configurations...");

      // Connect to model-wise serial tracking collection
      await MongoDBService.connect("main-data", "modelSerialConfig");

      // Get all existing model configurations
      const allModelConfigs = await MongoDBService.collection
        .find({})
        .toArray();

      for (const config of allModelConfigs) {
        const modelNumber = config.modelNumber;

        // Calculate the correct starting serial for this model
        const tempCurrentModel = this.currentModelNumber;
        this.currentModelNumber = modelNumber; // Temporarily set for calculation
        const correctStartingSerial = await this.getModelStartingSerial();
        this.currentModelNumber = tempCurrentModel; // Restore

        // Only update if the starting serial is different
        if (config.startingSerial !== correctStartingSerial) {
          logger.info(
            `🔄 Updating model ${modelNumber}: startingSerial ${config.startingSerial} → ${correctStartingSerial}`
          );

          await MongoDBService.collection.updateOne(
            { modelNumber: modelNumber },
            {
              $set: {
                startingSerial: correctStartingSerial,
                lastUpdated: new Date(),
              },
            }
          );
        } else {
          logger.info(
            `✅ Model ${modelNumber} already has correct startingSerial: ${correctStartingSerial}`
          );
        }
      }

      logger.info("✅ Finished fixing model serial configurations");
    } catch (error) {
      logger.error("❌ Error fixing model serial configurations:", error);
      throw error;
    }
  }
}

export default new SerialNumberGeneratorService();
