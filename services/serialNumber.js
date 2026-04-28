import { format, isAfter, isBefore } from "date-fns";
import MongoDBService from "./mongoDbService.js";
import logger from "../logger.js";

class SerialNumberGeneratorService {
  constructor() {
    this.currentSerialNumber = 1;
    this.lastResetDate = new Date();
    this.resetHour = 0; // <-- Set default reset hour to 0 (midnight)
    this.resetMinute = 0; // <-- Set default reset minute to 0
    this.isInitialized = false;
    this.currentModelNumber = null; // Track current model for separate sequences
    this.modelStartingSerials = {
      default: 1001,
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

        // Removed: await this.saveUsedSerialNumber(this.currentSerialNumber - 1);
        // Do NOT save here. Let the first use save the serial number.
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
    const serialNumber = this.currentSerialNumber.toString().padStart(5, "0");

    // Save the USED serial number to model-wise configuration
    await this.saveUsedSerialNumber(this.currentSerialNumber);

    this.currentSerialNumber++;

    return serialNumber;
  }

  async getNextDecSerialNumber2() {
    const reset = await this.checkAndResetSerialNumber();

    // CRITICAL: ALWAYS get fresh model from database on every call
    const currentModelFromDB = await this.getCurrentModelNumber();

    // IMPORTANT: Always reload model config on every call to ensure fresh data
    // This ensures we never use stale model data when model changes during runtime
    logger.info(`🔍 ALWAYS reloading model config for: ${currentModelFromDB}`);

    // Set the current model (this will be the fresh one from DB)
    this.currentModelNumber = currentModelFromDB;

    // ALWAYS load fresh model-specific serial configuration from modelSerialConfig
    const modelConfig = await this.loadModelSerialConfig();

    // Get the correct starting serial for this model
    const modelStartingSerial = await this.getModelStartingSerial();

    // Determine the serial number to use
    let serialToUse;

    if (reset) {
      // Reset case - use model starting serial
      this.currentSerialNumber = modelStartingSerial;
      serialToUse = this.currentSerialNumber;

      logger.info(
        `🔄 RESET: Using starting serial ${serialToUse} for model: ${this.currentModelNumber}`
      );
    } else if (!modelConfig || !modelConfig.currentValue) {
      // No model config exists - start with model's starting serial
      this.currentSerialNumber = modelStartingSerial;
      serialToUse = this.currentSerialNumber;

      logger.info(
        `🆕 NEW MODEL: Starting with serial ${serialToUse} for model: ${this.currentModelNumber}`
      );
    } else {
      // Model config exists - continue from currentValue + 1
      const existingValue = parseInt(modelConfig.currentValue, 10);
      if (!isNaN(existingValue)) {
        const nextCandidate = existingValue + 1;
        // If the 5-digit serial range is full, restart from starting serial (1001)
        if (nextCandidate > 99999) {
          this.currentSerialNumber = modelStartingSerial;
          serialToUse = this.currentSerialNumber;
          logger.warn(
            `♻️ FULL RANGE: Model ${this.currentModelNumber} exceeded 99999 (last used: ${existingValue}). Restarting from starting serial ${serialToUse}`
          );
        } else {
          this.currentSerialNumber = nextCandidate;
          serialToUse = this.currentSerialNumber;
        }

        logger.info(
          `✅ CONTINUING: Model ${this.currentModelNumber} from ${existingValue} to ${serialToUse}`
        );
      } else {
        this.currentSerialNumber = modelStartingSerial;
        serialToUse = this.currentSerialNumber;

        logger.warn(
          `⚠️ INVALID DATA: Using starting serial ${serialToUse} for model: ${this.currentModelNumber}`
        );
      }
    }

    // Format the serial number
    const serialNumber = serialToUse.toString().padStart(5, "0");

    // Save the USED serial number to modelSerialConfig
    await this.saveUsedSerialNumber(serialToUse);

    // Increment for next call
    this.currentSerialNumber++;

    logger.info(
      `🎯 FINAL: Using serial ${serialNumber} for model: ${this.currentModelNumber} (next will be: ${this.currentSerialNumber}) - saved to modelSerialConfig`
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

    // Get current model to show in logs
    const currentModel = await this.getCurrentModelNumber();

    // CRITICAL: Always get model-specific reset date from database, never use cached global value
    // This ensures each model tracks its reset independently
    let modelSpecificLastResetDate = null;

    try {
      // Connect to model-wise serial tracking collection
      await MongoDBService.connect("main-data", "modelSerialConfig");

      const modelConfig = await MongoDBService.collection.findOne({
        modelNumber: currentModel || "default",
      });

      if (modelConfig && modelConfig.lastReset) {
        modelSpecificLastResetDate = new Date(modelConfig.lastReset);
        logger.info(
          `📅 Model ${currentModel} last reset: ${format(modelSpecificLastResetDate, "yyyy-MM-dd HH:mm:ss")}`
        );
      } else {
        logger.info(`📅 Model ${currentModel} has never been reset`);
        modelSpecificLastResetDate = null;
      }
    } catch (error) {
      logger.error("❌ Error fetching model-specific reset date:", error);
      modelSpecificLastResetDate = this.lastResetDate; // Fallback to global if DB fetch fails
    }

    // Set resetTime to 6:00 AM today
    const resetTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      this.resetHour,
      this.resetMinute
    );

    const debugInfo = {
      currentTime: format(now, "yyyy-MM-dd HH:mm:ss"),
      resetTimeToday: format(resetTime, "yyyy-MM-dd HH:mm:ss"),
      modelSpecificLastResetDate: modelSpecificLastResetDate
        ? format(modelSpecificLastResetDate, "yyyy-MM-dd HH:mm:ss")
        : "Never",
      currentModel: currentModel || "Unknown",
      currentSerialNumber: this.currentSerialNumber,
      isAfterResetTimeToday: isAfter(now, resetTime),
      wasModelLastResetBeforeResetTimeToday: modelSpecificLastResetDate
        ? isBefore(modelSpecificLastResetDate, resetTime)
        : true,
    };

    logger.info(
      `🕐 RESET CHECK (${currentModel || "Unknown"}): ${JSON.stringify(debugInfo, null, 2)}`
    );

    // RESET LOGIC: "First run after 6:00 AM each day FOR EACH MODEL INDEPENDENTLY"
    // Reset behavior applies to ALL models (CMB-877, CMB-778, etc.) but each model tracks its own reset
    // Reset should happen if:
    // 1. Current time is after 6:00 AM today (machine is running after reset time)
    // 2. THIS MODEL'S last reset was before 6:00 AM today (this model hasn't reset today yet)
    //
    // IMPORTANT: Each model resets independently!
    // - CMB-877 can reset at 7:00 AM → doesn't affect CMB-778
    // - CMB-778 can still reset at 8:00 AM on the same day → independent of CMB-877's reset
    //
    // Each model will reset to its specific starting serial:
    // - All models → reset to 1001 (S01001)
    //
    // This ensures reset happens exactly once per day per model on the first machine operation after 6:00 AM
    const isFirstRunAfter6AMForThisModel =
      isAfter(now, resetTime) &&
      (!modelSpecificLastResetDate ||
        isBefore(modelSpecificLastResetDate, resetTime));

    if (isFirstRunAfter6AMForThisModel) {
      // This is the first machine operation after 6:00 AM today FOR THIS SPECIFIC MODEL - time to reset!
      const modelStartingSerial = await this.getModelStartingSerial();
      const oldSerial = this.currentSerialNumber;

      this.currentSerialNumber = modelStartingSerial;
      // Update the global lastResetDate for this service instance
      this.lastResetDate = now;

      logger.info(
        `🔄 FIRST RUN AFTER 6:00 AM RESET (${currentModel}): Serial number reset from ${oldSerial} to ${modelStartingSerial} (S${modelStartingSerial.toString().padStart(5, "0")}) at ${format(now, "yyyy-MM-dd HH:mm:ss")}`
      );
      logger.info(
        `📅 Reset trigger: This is the first machine operation after ${format(resetTime, "HH:mm:ss")} today for model ${currentModel}. Previous reset for this model: ${modelSpecificLastResetDate ? format(modelSpecificLastResetDate, "yyyy-MM-dd HH:mm:ss") : "Never"}`
      );
      logger.info(
        `🔑 IMPORTANT: This reset is model-specific. Other models can still reset independently today.`
      );

      // Update the database with the reset information (model-specific)
      await this.updateSerialConfigOnReset();

      return true;
    } else {
      if (isBefore(now, resetTime)) {
        logger.info(
          `✅ NO RESET (${currentModel}): Current time ${format(now, "HH:mm:ss")} is before reset time ${format(resetTime, "HH:mm:ss")}. Serial continues from ${this.currentSerialNumber} (S${this.currentSerialNumber.toString().padStart(5, "0")})`
        );
      } else {
        logger.info(
          `✅ NO RESET (${currentModel}): Model ${currentModel} already reset today after ${format(resetTime, "HH:mm:ss")}. Serial continues from ${this.currentSerialNumber} (S${this.currentSerialNumber.toString().padStart(5, "0")})`
        );
        logger.info(
          `🔑 NOTE: Other models can still reset independently if they haven't reset today yet.`
        );
      }
      return false;
    }
  }

  async getModelStartingSerial() {
    try {
      // Always get fresh model number from database
      const modelNumber = await this.getCurrentModelNumber();

      if (modelNumber) {
        // Requirement: starting serial should always be 1001
        logger.info(
          `✅ Model ${modelNumber} → starting serial: 1001 (S01001)`
        );
        return 1001;
      } else {
        logger.warn(
          "⚠️ No model number found, using default starting serial: 1001 (S01001)"
        );
        return this.modelStartingSerials["default"];
      }
    } catch (error) {
      logger.error("❌ Error fetching model starting serial:", error);
      logger.warn("⚠️ Defaulting to serial number 1001 (S01001) due to error");
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
        logger.info(
          `Found serial number reset configuration: ${serialConfig.resetTime}, interval: ${serialConfig.resetInterval}`
        );

        // Only apply if reset is enabled (daily interval)
        if (serialConfig.resetInterval === "daily") {
          // ENFORCE 12:00 AM RESET FOR ALL MODELS
          this.resetHour = 0;
          this.resetMinute = 0;
          logger.info(
            `Reset time enforced to 00:00 (12:00 AM) for all models.`
          );
        } else {
          logger.info(
            `Reset interval is '${serialConfig.resetInterval}', using default reset time`
          );
          this.resetHour = 0;
          this.resetMinute = 0;
        }

        // Update lastResetDate if available
        if (serialConfig.lastReset) {
          this.lastResetDate = new Date(serialConfig.lastReset);
          logger.info(`Last reset date loaded: ${this.lastResetDate}`);
        }
      } else {
        logger.warn(
          "No serial number reset configuration found, using defaults (00:00)"
        );
        this.resetHour = 0;
        this.resetMinute = 0;
      }
    } catch (error) {
      logger.error("Error fetching serial number reset configuration:", error);
      logger.warn("Using default reset time (00:00) due to error");
      this.resetHour = 0;
      this.resetMinute = 0;
    }
  }

  async updateSerialConfigOnReset() {
    try {
      // CRITICAL FIX: Always get fresh model number instead of using fallback to "default"
      const modelNumber = (await this.getCurrentModelNumber()) || "default";

      logger.info(`🔄 RESET: Updating serial config for model: ${modelNumber}`);

      // Connect to a new collection for model-wise serial tracking
      await MongoDBService.connect("main-data", "modelSerialConfig");

      // Get the correct starting serial using our dynamic calculation
      // NOTE: This call will change connection to config, so we need to reconnect after
      const dynamicStartingSerial = await this.getModelStartingSerial();

      // CRITICAL: Reconnect to modelSerialConfig after getModelStartingSerial()
      await MongoDBService.connect("main-data", "modelSerialConfig");
      logger.info(
        "✅ Reconnected to main-data.modelSerialConfig collection after getModelStartingSerial"
      );

      const now = new Date();

      // Save currentValue as startingSerial - 1 so that next serial is startingSerial
      const updateData = {
        modelNumber: modelNumber,
        currentValue: (dynamicStartingSerial - 1).toString(), // <-- FIXED: Save as startingSerial - 1
        lastUpdated: now, // ← Latest activity timestamp
        startingSerial: dynamicStartingSerial, // Use dynamic calculation
        lastReset: now, // ← When reset happened
        updatedAt: now, // ← Should match lastUpdated for reset operations
      };

      // Upsert the model-specific configuration
      await MongoDBService.collection.updateOne(
        { modelNumber: modelNumber },
        { $set: updateData },
        { upsert: true }
      );

      logger.info(
        `Model-wise serial reset updated in modelSerialConfig: Model=${modelNumber}, currentValue=${updateData.currentValue}, startingSerial=${updateData.startingSerial}, lastReset=${updateData.lastReset.toISOString()}`
      );

      // Also update the global serialNoconfig for backward compatibility
      await MongoDBService.connect("main-data", "serialNoconfig");
      const serialConfig = await MongoDBService.collection.findOne({});

      if (serialConfig && serialConfig.resetInterval === "daily") {
        await MongoDBService.collection.updateOne(
          {},
          {
            $set: {
              currentValue: (dynamicStartingSerial - 1).toString(), // <-- FIXED: Save as startingSerial - 1
              lastReset: now,
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
      // ALWAYS connect fresh to config collection to get current model
      await MongoDBService.connect("main-data", "config");
      const configData = await MongoDBService.collection.findOne({});

      logger.info(
        `🔍 DEBUG: Raw config data from DB: ${JSON.stringify(configData?.currentModelConfig?.modelNumber || "null")}`
      );

      if (
        configData &&
        configData.currentModelConfig &&
        configData.currentModelConfig.modelNumber
      ) {
        const freshModelNumber = configData.currentModelConfig.modelNumber;
        logger.info(
          `✅ FRESH MODEL from DB: ${freshModelNumber} (was cached as: ${this.currentModelNumber})`
        );

        // Update cached value
        this.currentModelNumber = freshModelNumber;
        return freshModelNumber;
      } else {
        logger.warn(
          "⚠️ No model configuration found in config collection, using null"
        );
        this.currentModelNumber = null;
        return null;
      }
    } catch (error) {
      logger.error(
        "❌ Error fetching current model number from config:",
        error
      );
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

      // IMPORTANT: Ensure we connect to modelSerialConfig after getCurrentModelNumber()
      // which may have changed the connection to config collection
      await MongoDBService.connect("main-data", "modelSerialConfig");
      logger.info("✅ Connected to main-data.modelSerialConfig collection");

      // CRITICAL: Get existing model config to preserve lastReset field
      const existingConfig = await MongoDBService.collection.findOne({
        modelNumber: modelNumber,
      });

      // Get the correct starting serial using our dynamic calculation
      // NOTE: This call will change connection to config, so we need to reconnect after
      const dynamicStartingSerial = await this.getModelStartingSerial();

      // CRITICAL: Reconnect to modelSerialConfig after getModelStartingSerial()
      await MongoDBService.connect("main-data", "modelSerialConfig");
      logger.info(
        "✅ Reconnected to main-data.modelSerialConfig collection after getModelStartingSerial"
      );

      // Update or create model-specific serial configuration with the USED serial number
      // IMPORTANT: Preserve existing lastReset field if it exists
      const now = new Date();

      const updateData = {
        modelNumber: modelNumber,
        currentValue: usedSerialNumber.toString(), // Last used, not next
        lastUpdated: now, // ← Latest activity timestamp
        startingSerial: dynamicStartingSerial, // Use dynamic calculation
        updatedAt: now, // ← Should match lastUpdated for normal operations
      };

      // CRITICAL FIX: Only add lastReset if it exists in the existing config
      // This preserves reset history without overwriting it during normal operations
      if (existingConfig && existingConfig.lastReset) {
        updateData.lastReset = existingConfig.lastReset;
        logger.info(
          `📅 Preserving existing lastReset: ${existingConfig.lastReset}`
        );
      } else {
        logger.info(
          `📅 No existing lastReset found for model ${modelNumber} - will be set on first reset`
        );
      }

      logger.info(
        `📝 Upserting data to modelSerialConfig: ${JSON.stringify(updateData)}`
      );

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
        `Model-wise serial number saved to modelSerialConfig: Model=${modelNumber}, lastUsed=${updateData.currentValue}, startingSerial=${updateData.startingSerial}, lastReset=${updateData.lastReset ? new Date(updateData.lastReset).toISOString() : "Not set yet"}, lastUpdated=${updateData.lastUpdated.toISOString()}, updatedAt=${updateData.updatedAt.toISOString()}`
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
        let needsUpdate = false;
        const updateFields = {};

        // Calculate the correct starting serial for this model
        const tempCurrentModel = this.currentModelNumber;
        this.currentModelNumber = modelNumber; // Temporarily set for calculation
        const correctStartingSerial = await this.getModelStartingSerial();
        this.currentModelNumber = tempCurrentModel; // Restore

        // Check if starting serial needs fixing
        if (config.startingSerial !== correctStartingSerial) {
          logger.info(
            `🔄 Updating model ${modelNumber}: startingSerial ${config.startingSerial} → ${correctStartingSerial}`
          );
          updateFields.startingSerial = correctStartingSerial;
          needsUpdate = true;
        } else {
          logger.info(
            `✅ Model ${modelNumber} already has correct startingSerial: ${correctStartingSerial}`
          );
        }

        // Check if lastReset field is missing (for models that have been used but never reset)
        if (
          !config.lastReset &&
          config.currentValue &&
          parseInt(config.currentValue) > 0
        ) {
          logger.info(
            `📅 Model ${modelNumber} is missing lastReset field but has been used (currentValue: ${config.currentValue}). This suggests it hasn't reset yet.`
          );
          // Don't add a fake lastReset - it will be set when the model actually resets
        } else if (config.lastReset) {
          logger.info(
            `✅ Model ${modelNumber} has lastReset: ${config.lastReset}`
          );
        }

        // Check if updatedAt field is missing (should match lastUpdated for consistency)
        if (!config.updatedAt && config.lastUpdated) {
          logger.info(
            `📅 Model ${modelNumber} is missing updatedAt field, adding it to match lastUpdated`
          );
          updateFields.updatedAt = new Date(config.lastUpdated);
          needsUpdate = true;
        } else if (!config.updatedAt && !config.lastUpdated) {
          logger.info(
            `📅 Model ${modelNumber} is missing both updatedAt and lastUpdated fields`
          );
          const now = new Date();
          updateFields.updatedAt = now;
          updateFields.lastUpdated = now;
          needsUpdate = true;
        }

        // Apply updates if needed
        if (needsUpdate) {
          await MongoDBService.collection.updateOne(
            { modelNumber: modelNumber },
            { $set: updateFields }
          );

          logger.info(
            `🔄 Updated model ${modelNumber} configuration: ${JSON.stringify(updateFields)}`
          );
        }
      }

      logger.info("✅ Finished fixing model serial configurations");
    } catch (error) {
      logger.error("❌ Error fixing model serial configurations:", error);
      throw error;
    }
  }

  // Utility method to check and report model configuration status
  async checkAllModelsStatus() {
    try {
      logger.info("📊 Checking status of all model configurations...");

      // Connect to model-wise serial tracking collection
      await MongoDBService.connect("main-data", "modelSerialConfig");

      // Get all existing model configurations
      const allModelConfigs = await MongoDBService.collection
        .find({})
        .toArray();

      const statusReport = {
        totalModels: allModelConfigs.length,
        models: [],
        summary: {
          withReset: 0,
          withoutReset: 0,
          correctStartingSerial: 0,
          incorrectStartingSerial: 0,
        },
      };

      for (const config of allModelConfigs) {
        const modelNumber = config.modelNumber;

        // Calculate expected starting serial
        const tempCurrentModel = this.currentModelNumber;
        this.currentModelNumber = modelNumber;
        const expectedStartingSerial = await this.getModelStartingSerial();
        this.currentModelNumber = tempCurrentModel;

        const modelStatus = {
          modelNumber: modelNumber,
          currentValue: config.currentValue,
          startingSerial: config.startingSerial,
          expectedStartingSerial: expectedStartingSerial,
          startingSerialCorrect:
            config.startingSerial === expectedStartingSerial,
          hasLastReset: !!config.lastReset,
          lastReset: config.lastReset
            ? new Date(config.lastReset).toISOString()
            : null,
          lastUpdated: config.lastUpdated
            ? new Date(config.lastUpdated).toISOString()
            : null,
          hasBeenUsed: config.currentValue && parseInt(config.currentValue) > 0,
        };

        statusReport.models.push(modelStatus);

        // Update summary
        if (modelStatus.hasLastReset) {
          statusReport.summary.withReset++;
        } else {
          statusReport.summary.withoutReset++;
        }

        if (modelStatus.startingSerialCorrect) {
          statusReport.summary.correctStartingSerial++;
        } else {
          statusReport.summary.incorrectStartingSerial++;
        }
      }

      logger.info(
        `📊 MODEL STATUS REPORT: ${JSON.stringify(statusReport, null, 2)}`
      );
      return statusReport;
    } catch (error) {
      logger.error("❌ Error checking all models status:", error);
      throw error;
    }
  }

  // Force refresh the service when model changes - call this when model is changed externally
  async forceRefresh() {
    try {
      logger.info(
        "🔄 FORCE REFRESH: Clearing cached model data and reloading..."
      );

      // Clear cached model data
      this.currentModelNumber = null;

      // Get fresh model from database
      const currentModel = await this.getCurrentModelNumber();
      logger.info(`🔄 FORCE REFRESH: Fresh model from DB: ${currentModel}`);

      // Load fresh model config
      const modelConfig = await this.loadModelSerialConfig();

      if (modelConfig && modelConfig.currentValue) {
        const existingValue = parseInt(modelConfig.currentValue, 10);
        if (!isNaN(existingValue)) {
          this.currentSerialNumber = existingValue + 1;
          logger.info(
            `🔄 FORCE REFRESH: Set next serial to ${this.currentSerialNumber} for model ${currentModel}`
          );
        }
      } else {
        const startingSerial = await this.getModelStartingSerial();
        this.currentSerialNumber = startingSerial;
        logger.info(
          `🔄 FORCE REFRESH: Set starting serial to ${this.currentSerialNumber} for new model ${currentModel}`
        );
      }

      logger.info("✅ FORCE REFRESH: Completed successfully");
    } catch (error) {
      logger.error("❌ FORCE REFRESH: Failed", error);
      throw error;
    }
  }

  // Utility method to check if a reset is needed without performing it
  async checkResetStatus() {
    try {
      const now = new Date();
      const resetTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        this.resetHour,
        this.resetMinute
      );

      const status = {
        currentTime: format(now, "yyyy-MM-dd HH:mm:ss"),
        resetTime: format(resetTime, "yyyy-MM-dd HH:mm:ss"),
        lastResetDate: this.lastResetDate
          ? format(this.lastResetDate, "yyyy-MM-dd HH:mm:ss")
          : "Never",
        currentSerialNumber: this.currentSerialNumber,
        resetHour: this.resetHour,
        resetMinute: this.resetMinute,
        isAfterResetTime: isAfter(now, resetTime),
        needsReset:
          isAfter(now, resetTime) &&
          (!this.lastResetDate || isBefore(this.lastResetDate, resetTime)),
        currentModel: await this.getCurrentModelNumber(),
        modelStartingSerial: await this.getModelStartingSerial(),
      };

      logger.info(`📊 RESET STATUS: ${JSON.stringify(status, null, 2)}`);
      return status;
    } catch (error) {
      logger.error("❌ Error checking reset status:", error);
      throw error;
    }
  }

  // Force a reset regardless of timing (for manual reset or testing)
  async forceReset() {
    try {
      logger.info("🔄 FORCE RESET: Manually triggering serial number reset...");

      const modelStartingSerial = await this.getModelStartingSerial();
      const oldSerial = this.currentSerialNumber;
      const oldLastResetDate = this.lastResetDate;

      this.currentSerialNumber = modelStartingSerial;
      this.lastResetDate = new Date();

      logger.info(
        `🔄 FORCE RESET: Serial number reset from ${oldSerial} to ${modelStartingSerial} at ${format(this.lastResetDate, "yyyy-MM-dd HH:mm:ss")}`
      );
      logger.info(
        `📅 Previous reset was: ${oldLastResetDate ? format(oldLastResetDate, "yyyy-MM-dd HH:mm:ss") : "Never"}`
      );

      // Update the database with the reset information
      await this.updateSerialConfigOnReset();

      logger.info("✅ FORCE RESET: Completed successfully");
      return {
        success: true,
        oldSerial: oldSerial,
        newSerial: modelStartingSerial,
        resetTime: this.lastResetDate,
      };
    } catch (error) {
      logger.error("❌ FORCE RESET: Failed", error);
      throw error;
    }
  }
}

export default new SerialNumberGeneratorService();
