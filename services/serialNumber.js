import { format, isAfter, isBefore } from "date-fns";
import MongoDBService from "./mongoDbService.js";
import logger from "../logger.js";

// Serial number format: always 5 digits (00001-99999)
const SERIAL_DIGITS = 5;
const SERIAL_MAX = 99999;

// 12am reset is in this timezone so reset is at midnight local, not server (e.g. UTC → 6am in India). Set RESET_TIMEZONE env to override.
/* eslint-disable no-undef */
const RESET_TIMEZONE = process.env?.RESET_TIMEZONE || "Asia/Kolkata";
/* eslint-enable no-undef */

/**
 * Returns the Date (UTC) for "today at 00:00" (12am midnight) in the reset timezone.
 * Reset must happen ONLY at 12am midnight on date change, never at 12pm noon.
 */
export function getTodayMidnightInTimezone(now, timezone = RESET_TIMEZONE) {
  const formatter = new globalThis.Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // Asia/Kolkata = IST = +05:30; 12am IST is this instant in UTC
  if (timezone === "Asia/Kolkata" || timezone.includes("Kolkata")) {
    return new Date(`${ymd}T00:00:00+05:30`);
  }
  // Other TZ: assume +00:00 for safety (midnight UTC)
  return new Date(`${ymd}T00:00:00Z`);
}

/**
 * Returns calendar date string (YYYY-MM-DD) in the given timezone for a Date.
 * Used to detect date change: reset only when this string changes to a new day.
 */
export function getCalendarDateInTimezone(date, timezone = RESET_TIMEZONE) {
  const formatter = new globalThis.Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

class SerialNumberGeneratorService {
  constructor() {
    this.currentSerialNumber = 1;
    this.lastResetDate = new Date();
    this.resetHour = 0;
    this.resetMinute = 0;
    this.resetTimezone = RESET_TIMEZONE;
    this.isInitialized = false;
    this.currentModelNumber = null; // Track current model for separate sequences
    this.modelStartingSerials = {
      "CMB-877": 701,
      default: 1,
    };
  }

  getStartingSerialForModel(modelNumber) {
    if (modelNumber === "CMB-877") {
      return 701;
    }
    if (modelNumber === "CMB-778") {
      return 1;
    }
    return 1;
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
    // OCR may return 3–5 digit serial fragments; prefer longest plausible match
    const match = ocrData.match(/\d{3,5}/);
    return match ? parseInt(match[0], 10) + 1 : 1; // Start from next number, or 1 if not found
  }

  setResetTime(hour, minute) {
    // Reset only at 12am midnight on date change; never 12pm noon.
    if (hour === 12 && minute === 0) {
      this.resetHour = 0;
      this.resetMinute = 0;
      logger.info("Reset time: 12:00 interpreted as midnight (00:00), not noon");
    } else {
      this.resetHour = hour;
      this.resetMinute = minute;
    }
    logger.info(`Reset time set to ${this.resetHour}:${String(this.resetMinute).padStart(2, "0")}`);
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
      // SKIP reset check during initialization to prevent unwanted resets on server restart
      // Reset will be checked on first actual serial number generation instead
      logger.info(
        "⏭️ Skipping reset check during initialization - will check on first serial generation"
      );
      // await this.checkAndResetSerialNumber();

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
    const serialNumber = this.currentSerialNumber.toString().padStart(SERIAL_DIGITS, "0");

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
        this.currentSerialNumber = existingValue + 1;
        serialToUse = this.currentSerialNumber;

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

    // VALIDATION: Ensure serial number doesn't exceed max (99999 for 5 digits)
    if (serialToUse > SERIAL_MAX) {
      logger.warn(
        `⚠️ Serial number ${serialToUse} exceeds ${SERIAL_MAX}, rolling over to 1`
      );
      serialToUse = 1;
      this.currentSerialNumber = 1;
    }

    // Format the serial number - always 5 digits (00001-99999)
    const serialNumber = serialToUse.toString().padStart(SERIAL_DIGITS, "0");

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
    const currentModel = await this.getCurrentModelNumber();

    let persistedLastReset = null;
    let foundConfig = null;
    try {
      await MongoDBService.connect("main-data", "modelSerialConfig");
      const modelConfig = await MongoDBService.collection.findOne({
        modelNumber: currentModel || "default",
      });
      foundConfig = modelConfig || null;
      if (modelConfig && modelConfig.lastReset) {
        persistedLastReset = new Date(modelConfig.lastReset);
        this.lastResetDate = persistedLastReset;
      }
    } catch (error) {
      logger.error("❌ Error loading lastReset from modelSerialConfig:", error);
    }

    // Reactive reset behavior:
    // - Do NOT reset exactly at 00:00 by a scheduled job.
    // - Reset on the first machine operation AFTER local midnight when the calendar day has changed.
    // To enable this, we ensure lastReset is initialized once for models that exist but are missing it.
    const todayMidnight = getTodayMidnightInTimezone(now, this.resetTimezone);
    if (currentModel && foundConfig && !foundConfig.lastReset) {
      try {
        await MongoDBService.connect("main-data", "modelSerialConfig");
        await MongoDBService.collection.updateOne(
          { modelNumber: currentModel },
          {
            $set: {
              lastReset: todayMidnight,
              updatedAt: now,
            },
          }
        );
        persistedLastReset = todayMidnight;
        this.lastResetDate = todayMidnight;
        logger.info(
          `📅 Initialized missing lastReset for model ${currentModel} to ${todayMidnight.toISOString()}`
        );
      } catch (error) {
        logger.error(
          "❌ Error initializing missing lastReset in modelSerialConfig:",
          error
        );
      }
    }

    // Reset when we've crossed midnight since the last reset.
    // i.e. if lastReset is before today's midnight boundary (in reset TZ).
    const shouldReset =
      currentModel && persistedLastReset && persistedLastReset < todayMidnight;

    logger.info(
      `🕐 Serial reset check (reactive): model=${currentModel}, now=${now.toISOString()}, todayMidnight=${todayMidnight.toISOString()}, lastReset=${persistedLastReset ? persistedLastReset.toISOString() : "null"}, shouldReset=${shouldReset}`
    );

    if (shouldReset) {
      const modelStartingSerial = await this.getModelStartingSerial();
      const oldSerial = this.currentSerialNumber;
      this.currentSerialNumber = modelStartingSerial;
      this.lastResetDate = now;
      logger.info(
        `🔄 SERIAL RESET: Serial number reset from ${oldSerial} to ${modelStartingSerial} (S${modelStartingSerial.toString().padStart(SERIAL_DIGITS, "0")}) at ${now.toISOString()}`
      );
      await this.updateSerialConfigOnReset();
      return true;
    } else {
      logger.info(
        `✅ NO SERIAL RESET: Serial continues from ${this.currentSerialNumber} (S${this.currentSerialNumber.toString().padStart(SERIAL_DIGITS, "0")})`
      );
      return false;
    }
  }

  async resetAllModelsAtMidnight() {
    const now = new Date();
    const timezone = this.resetTimezone;

    try {
      await MongoDBService.connect("main-data", "modelSerialConfig");
      const models = await MongoDBService.collection
        .find({}, { projection: { modelNumber: 1 } })
        .toArray();

      const modelNumbers = Array.from(
        new Set(
          models
            .map((m) => m?.modelNumber)
            .filter((m) => typeof m === "string" && m.length > 0)
        )
      );

      if (modelNumbers.length === 0) {
        logger.warn(
          "⚠️ Daily serial reset: no modelSerialConfig entries found; nothing to reset"
        );
        return { resetCount: 0, models: [] };
      }

      const lastResetInstant = getTodayMidnightInTimezone(now, timezone);
      let resetCount = 0;

      for (const modelNumber of modelNumbers) {
        const startingSerial = this.getStartingSerialForModel(modelNumber);
        const lastUsedAfterReset = Math.max(0, startingSerial - 1);

        await MongoDBService.collection.updateOne(
          { modelNumber },
          {
            $set: {
              modelNumber,
              startingSerial,
              currentValue: lastUsedAfterReset.toString(),
              lastReset: lastResetInstant,
              lastUpdated: now,
              updatedAt: now,
            },
          },
          { upsert: true }
        );

        resetCount += 1;
      }

      // Backward compatibility: update global serialNoconfig lastReset timestamp.
      try {
        await MongoDBService.connect("main-data", "serialNoconfig");
        await MongoDBService.collection.updateOne(
          {},
          { $set: { lastReset: lastResetInstant } },
          { upsert: true }
        );
      } catch (error) {
        logger.error("❌ Error updating serialNoconfig lastReset:", error);
      }

      logger.info(
        `✅ Daily serial reset completed at ${lastResetInstant.toISOString()} for ${resetCount} models`
      );
      return { resetCount, models: modelNumbers, lastResetInstant };
    } catch (error) {
      logger.error("❌ Daily serial reset failed:", error);
      throw error;
    }
  }

  async getModelStartingSerial() {
    try {
      // Always get fresh model number from database
      const modelNumber = await this.getCurrentModelNumber();

      if (modelNumber) {
        // Model-specific starting serial configurations for ALL models
        if (modelNumber === "CMB-877") {
          logger.info(
            `✅ Model ${modelNumber} → starting serial: 701 (S${String(701).padStart(SERIAL_DIGITS, "0")})`
          );
          return 701;
        } else if (modelNumber === "CMB-778") {
          // CMB-778 starts from 1
          logger.info(
            `✅ Model ${modelNumber} → starting serial: 1 (S${String(1).padStart(SERIAL_DIGITS, "0")})`
          );
          return 1;
        } else {
          // All other models start from 1
          logger.info(
            `✅ Model ${modelNumber} → starting serial: 1 (S${String(1).padStart(SERIAL_DIGITS, "0")}) [default for this model]`
          );
          return 1;
        }
      } else {
        logger.warn(
          `⚠️ No model number found, using default starting serial: 1 (S${String(1).padStart(SERIAL_DIGITS, "0")})`
        );
        return this.modelStartingSerials["default"];
      }
    } catch (error) {
      logger.error("❌ Error fetching model starting serial:", error);
      logger.warn(
        `⚠️ Defaulting to serial number 1 (S${String(1).padStart(SERIAL_DIGITS, "0")}) due to error`
      );
      return this.modelStartingSerials["default"];
    }
  }

  async getResetTimeFromConfig() {
    try {
      // Connect to serialNoconfig collection to fetch reset time configuration
      await MongoDBService.connect("main-data", "serialNoconfig");
      const serialConfig = await MongoDBService.collection.findOne({});

      // Requirement: reset must happen ONLY at 12am (00:00) midnight daily on date change, never at 12pm noon.
      // Keep reading DB config for lastReset (history), but force reset time to midnight.
      if (serialConfig) {
        logger.info(
          `Found serial number reset configuration: ${serialConfig.resetTime || "n/a"}, interval: ${serialConfig.resetInterval || "n/a"}`
        );
        if (serialConfig.lastReset) {
          this.lastResetDate = new Date(serialConfig.lastReset);
          logger.info(`Last reset date loaded: ${this.lastResetDate}`);
        }
      } else {
        logger.warn("No serial number reset configuration found.");
      }

      this.resetHour = 0;
      this.resetMinute = 0;
      logger.info("Reset time forced to 00:00 (12am) daily");
    } catch (error) {
      logger.error("Error fetching serial number reset configuration:", error);
      logger.warn("Using default reset time (0:00) due to error");
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

      // Update or create model-specific serial configuration
      const updateData = {
        modelNumber: modelNumber,
        currentValue: this.currentSerialNumber.toString(),
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
              currentValue: this.currentSerialNumber.toString(),
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

      // Preserve existing lastReset if present; otherwise initialize to "today midnight" so reactive reset logic can work.
      // This avoids the "lastReset missing forever" situation while still keeping reset reactive (it won't reset until next day change).
      if (existingConfig && existingConfig.lastReset) {
        updateData.lastReset = existingConfig.lastReset;
        logger.info(`📅 Preserving existing lastReset: ${existingConfig.lastReset}`);
      } else {
        const initLastReset = getTodayMidnightInTimezone(now, this.resetTimezone);
        updateData.lastReset = initLastReset;
        logger.info(
          `📅 Initializing missing lastReset for model ${modelNumber} to ${initLastReset.toISOString()}`
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

export { RESET_TIMEZONE };
export default new SerialNumberGeneratorService();
