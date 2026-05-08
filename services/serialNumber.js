import { format, isAfter, isBefore } from "date-fns";
import { MongoClient } from "mongodb";
import logger from "../logger.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

class SerialNumberGeneratorService {
  constructor() {
    this.currentSerialNumber = 1;
    this.lastResetDate = new Date();
    this.resetHour = 0;
    this.resetMinute = 0;
    this.isInitialized = false;
    this.currentModelNumber = null;
    this.modelStartingSerials = {
      "CMB-877": 701,
      default: 1,
    };

    // Dedicated MongoDB client for serial number operations.
    // This is SEPARATE from the shared MongoDBService singleton to prevent
    // collection-switching race conditions that caused random serial resets.
    this._ownClient = null;
    this._ownDb = null;

    // Simple async mutex to prevent overlapping serial generation calls.
    this._serialLock = Promise.resolve();

    this.localSerialCachePath = path.join(process.cwd(), ".serial-cache.json");
    this._localCacheLoaded = false;
    this._localCache = { models: {} };
  }

  /**
   * Returns a collection reference from our own dedicated client.
   * This never interferes with MongoDBService.collection used by the rest of the app.
   */
  async _col(collectionName) {
    if (!this._ownClient) {
      const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
      this._ownClient = new MongoClient(uri);
      await this._ownClient.connect();
      this._ownDb = this._ownClient.db("main-data");
      logger.info("🔌 SerialNumberService: dedicated MongoDB connection established");
    }
    return this._ownDb.collection(collectionName);
  }

  async _loadLocalCache() {
    if (this._localCacheLoaded) {
      return;
    }
    try {
      const raw = await fs.readFile(this.localSerialCachePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        this._localCache = {
          models: parsed.models && typeof parsed.models === "object" ? parsed.models : {},
        };
      }
    } catch (e) {
      // File missing/invalid is fine — we'll create it on first write.
      this._localCache = { models: {} };
    } finally {
      this._localCacheLoaded = true;
    }
  }

  async _writeLocalCache() {
    await fs.mkdir(path.dirname(this.localSerialCachePath), { recursive: true });
    const tmp = `${this.localSerialCachePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this._localCache, null, 2), "utf8");
    await fs.rename(tmp, this.localSerialCachePath);
  }

  async _getLocalModelState(modelNumber) {
    await this._loadLocalCache();
    const key = modelNumber || "default";
    const s = this._localCache.models[key];
    if (!s || typeof s !== "object") {
      return null;
    }
    return {
      currentValue: typeof s.currentValue === "string" ? s.currentValue : `${s.currentValue ?? ""}`,
      lastUpdated: s.lastUpdated ? new Date(s.lastUpdated) : null,
      lastReset: s.lastReset ? new Date(s.lastReset) : null,
      startingSerial: typeof s.startingSerial === "number" ? s.startingSerial : null,
    };
  }

  async _setLocalModelState(modelNumber, patch) {
    await this._loadLocalCache();
    const key = modelNumber || "default";
    const prev = this._localCache.models[key] && typeof this._localCache.models[key] === "object"
      ? this._localCache.models[key]
      : {};
    const next = {
      ...prev,
      ...patch,
    };
    // Normalize dates to ISO strings for durability.
    if (next.lastUpdated instanceof Date) {
      next.lastUpdated = next.lastUpdated.toISOString();
    }
    if (next.lastReset instanceof Date) {
      next.lastReset = next.lastReset.toISOString();
    }
    this._localCache.models[key] = next;
    await this._writeLocalCache();
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
    // Assuming the serial number is a 3-digit number in the OCR data
    // Modify this regex if the format is different
    const match = ocrData.match(/\d{3}/);
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
      this.originalDbName = dbName;
      this.originalCollectionName = collectionName;

      // Eagerly establish our dedicated connection
      await this._col("modelSerialConfig");

      await this.getResetTimeFromConfig();

      logger.info(
        "🔍 Loading serial configuration from modelSerialConfig (primary database)..."
      );
      const modelConfig = await this.loadModelSerialConfig();

      const modelStartingSerial = await this.getModelStartingSerial();
      logger.info(`Model-based starting serial number: ${modelStartingSerial}`);

      if (modelConfig && modelConfig.currentValue) {
        logger.info(`✅ Using modelSerialConfig as primary source`);
      } else {
        logger.info(
          `🆕 No modelSerialConfig found for current model, creating new entry with starting serial: ${modelStartingSerial}`
        );
        this.currentSerialNumber = modelStartingSerial;
        this.lastResetDate = new Date();
        await this.saveUsedSerialNumber(this.currentSerialNumber - 1);
      }

      logger.info(
        "⏭️ Skipping reset check during initialization - will check on first serial generation"
      );

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
      const currentModel = await this.getCurrentModelNumber();
      const query = currentModel ? { ModelNumber: currentModel } : {};

      logger.info(
        `🔍 Searching for last document in records collection with model: ${currentModel || "any"}`
      );

      const recordsCol = await this._col("records");
      const latestRecord = await recordsCol
        .find(query)
        .sort({ Timestamp: -1 })
        .limit(1)
        .toArray();

      const lastDocument = latestRecord[0] || null;

      if (lastDocument) {
        logger.info(
          `🔍 Last document: Model=${lastDocument.ModelNumber || "not set"}, Serial=${lastDocument.SerialNumber}`
        );
      } else {
        logger.info(
          `🔍 No records found for model: ${currentModel || "any"}`
        );
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
    // Acquire mutex so concurrent callers queue up instead of interleaving.
    // This is critical: even with our own DB client, two overlapping calls
    // could read the same currentValue and produce duplicate serials.
    let releaseLock;
    const lockPromise = new Promise((resolve) => { releaseLock = resolve; });
    const previousLock = this._serialLock;
    this._serialLock = lockPromise;
    await previousLock;

    try {
      return await this._getNextDecSerialNumber2Impl();
    } finally {
      releaseLock();
    }
  }

  async _getNextDecSerialNumber2Impl() {
    const reset = await this.checkAndResetSerialNumber();

    const currentModelFromDB = await this.getCurrentModelNumber();
    this.currentModelNumber = currentModelFromDB;

    const modelConfig = await this.loadModelSerialConfig();
    const modelStartingSerial = await this.getModelStartingSerial();

    let serialToUse;

    if (reset) {
      this.currentSerialNumber = modelStartingSerial;
      serialToUse = this.currentSerialNumber;

      logger.info(
        `🔄 RESET: Using starting serial ${serialToUse} for model: ${this.currentModelNumber}`
      );
    } else if (!modelConfig || !modelConfig.currentValue) {
      this.currentSerialNumber = modelStartingSerial;
      serialToUse = this.currentSerialNumber;

      logger.info(
        `🆕 NEW MODEL: Starting with serial ${serialToUse} for model: ${this.currentModelNumber}`
      );
    } else {
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

    if (serialToUse > 9999) {
      logger.warn(
        `⚠️ Serial number ${serialToUse} exceeds 9999, rolling over to 1`
      );
      serialToUse = 1;
      this.currentSerialNumber = 1;
    }

    const serialNumber = serialToUse.toString().padStart(4, "0");

    await this.saveUsedSerialNumber(serialToUse);

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

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0, 0, 0, 0
    );

    try {
      const serialCol = await this._col("modelSerialConfig");
      const modelNumber = currentModel || "default";

      const modelConfig = await serialCol.findOne({ modelNumber });

      const referenceDateRaw =
        modelConfig?.lastReset || modelConfig?.lastUpdated || null;
      const referenceDate = referenceDateRaw ? new Date(referenceDateRaw) : null;

      const shouldReset = !!referenceDate && referenceDate < todayStart;

      logger.info(
        `🕛 Serial reset check (midnight-only): model=${modelNumber}, referenceDate=${referenceDate}, todayStart=${todayStart}, shouldReset=${shouldReset}`
      );

      if (!shouldReset) {
        logger.info(
          `✅ NO SERIAL RESET: Serial continues from ${this.currentSerialNumber} (S${this.currentSerialNumber.toString().padStart(4, "0")})`
        );
        return false;
      }

      const modelStartingSerial = await this.getModelStartingSerial();
      const oldSerial = this.currentSerialNumber;

      const lastUsedAfterReset = Math.max(0, modelStartingSerial - 1);

      // Re-acquire collection ref (getModelStartingSerial doesn't affect us
      // anymore, but being explicit is cheap)
      const serialCol2 = await this._col("modelSerialConfig");
      const resetWrite = await serialCol2.updateOne(
        {
          modelNumber,
          $or: [
            { lastReset: { $lt: todayStart } },
            { lastReset: { $exists: false }, lastUpdated: { $lt: todayStart } },
          ],
        },
        {
          $set: {
            modelNumber,
            currentValue: lastUsedAfterReset.toString(),
            startingSerial: modelStartingSerial,
            lastReset: now,
            lastUpdated: now,
            updatedAt: now,
          },
        }
      );

      if (resetWrite.matchedCount === 0) {
        logger.warn(
          `⚠️ Reset condition not matched during update; skipping in-memory reset for model ${modelNumber}`
        );
        return false;
      }

      this.currentSerialNumber = modelStartingSerial;
      this.lastResetDate = now;

      logger.info(
        `🔄 SERIAL RESET: Serial number reset from ${oldSerial} to ${modelStartingSerial} (S${modelStartingSerial.toString().padStart(4, "0")}) at ${now.toISOString()}`
      );

      try {
        const snoCol = await this._col("serialNoconfig");
        const serialConfig = await snoCol.findOne({});
        if (serialConfig && serialConfig.resetInterval === "daily") {
          await snoCol.updateOne(
            {},
            {
              $set: {
                currentValue: lastUsedAfterReset.toString(),
                lastReset: now,
              },
            }
          );
        }
      } catch (compatError) {
        logger.warn(
          "⚠️ Failed to update serialNoconfig during reset (compat only):",
          compatError
        );
      }

      return true;
    } catch (error) {
      logger.error(
        "❌ Error checking/writing modelSerialConfig for serial reset:",
        error
      );

      const modelNumber = currentModel || "default";
      try {
        const local = await this._getLocalModelState(modelNumber);
        const referenceDate =
          local?.lastReset || local?.lastUpdated || this.lastResetDate || null;
        const shouldReset = !!referenceDate && referenceDate < todayStart;

        logger.warn(
          `⚠️ MongoDB unavailable; using local cache for reset decision: model=${modelNumber}, referenceDate=${referenceDate}, todayStart=${todayStart}, shouldReset=${shouldReset}`
        );

        if (!shouldReset) {
          return false;
        }

        const modelStartingSerial = await this.getModelStartingSerial();
        const oldSerial = this.currentSerialNumber;
        const lastUsedAfterReset = Math.max(0, modelStartingSerial - 1);

        this.currentSerialNumber = modelStartingSerial;
        this.lastResetDate = now;

        await this._setLocalModelState(modelNumber, {
          currentValue: lastUsedAfterReset.toString(),
          startingSerial: modelStartingSerial,
          lastReset: now,
          lastUpdated: now,
          updatedAt: now.toISOString(),
        });

        logger.info(
          `🔄 SERIAL RESET (LOCAL): Serial number reset from ${oldSerial} to ${modelStartingSerial} (S${modelStartingSerial.toString().padStart(4, "0")}) at ${now.toISOString()}`
        );
        return true;
      } catch (localErr) {
        logger.error("❌ Local cache fallback failed; skipping reset:", localErr);
        return false;
      }
    }
  }

  async getModelStartingSerial() {
    try {
      // Always get fresh model number from database
      const modelNumber = await this.getCurrentModelNumber();

      if (modelNumber) {
        // Model-specific starting serial configurations for ALL models
        if (modelNumber === "CMB-877") {
          logger.info(`✅ Model ${modelNumber} → starting serial: 701 (S0701)`);
          return 701; // Changed from 7001 to 701 (4 digits max)
        } else if (modelNumber === "CMB-778") {
          // CMB-778 starts from 1
          logger.info(`✅ Model ${modelNumber} → starting serial: 1 (S0001)`);
          return 1;
        } else {
          // All other models start from 1
          logger.info(
            `✅ Model ${modelNumber} → starting serial: 1 (S0001) [default for this model]`
          );
          return 1;
        }
      } else {
        logger.warn(
          "⚠️ No model number found, using default starting serial: 1 (S0001)"
        );
        return this.modelStartingSerials["default"];
      }
    } catch (error) {
      logger.error("❌ Error fetching model starting serial:", error);
      logger.warn("⚠️ Defaulting to serial number 1 (S0001) due to error");
      return this.modelStartingSerials["default"];
    }
  }

  async getResetTimeFromConfig() {
    try {
      const snoCol = await this._col("serialNoconfig");
      const serialConfig = await snoCol.findOne({});

      if (serialConfig && serialConfig.resetTime) {
        const [hour, minute] = serialConfig.resetTime.split(":").map(Number);
        logger.info(
          `Found serial number reset configuration: ${serialConfig.resetTime}, interval: ${serialConfig.resetInterval}`
        );

        if (serialConfig.resetInterval === "daily") {
          this.resetHour = hour || 0;
          this.resetMinute = minute || 0;
          logger.info(
            `Reset time updated from serialNoconfig: ${this.resetHour}:${this.resetMinute}`
          );
        } else {
          logger.info(
            `Reset interval is '${serialConfig.resetInterval}', using default reset time`
          );
          this.resetHour = 0;
          this.resetMinute = 0;
        }

        if (serialConfig.lastReset) {
          this.lastResetDate = new Date(serialConfig.lastReset);
          logger.info(`Last reset date loaded: ${this.lastResetDate}`);
        }
      } else {
        logger.warn(
          "No serial number reset configuration found, using defaults (0:00)"
        );
        this.resetHour = 0;
        this.resetMinute = 0;
      }
    } catch (error) {
      logger.error("Error fetching serial number reset configuration:", error);
      logger.warn("Using default reset time (0:00) due to error");
      this.resetHour = 0;
      this.resetMinute = 0;
    }
  }

  async updateSerialConfigOnReset() {
    try {
      const modelNumber = (await this.getCurrentModelNumber()) || "default";

      logger.info(`🔄 RESET: Updating serial config for model: ${modelNumber}`);

      const dynamicStartingSerial = await this.getModelStartingSerial();
      const now = new Date();
      const lastUsedAfterReset = Math.max(0, (dynamicStartingSerial || 1) - 1);

      const updateData = {
        modelNumber: modelNumber,
        currentValue: lastUsedAfterReset.toString(),
        lastUpdated: now,
        startingSerial: dynamicStartingSerial,
        lastReset: now,
        updatedAt: now,
      };

      const serialCol = await this._col("modelSerialConfig");
      await serialCol.updateOne(
        { modelNumber: modelNumber },
        { $set: updateData },
        { upsert: true }
      );

      logger.info(
        `Model-wise serial reset updated in modelSerialConfig: Model=${modelNumber}, currentValue=${updateData.currentValue}, startingSerial=${updateData.startingSerial}, lastReset=${updateData.lastReset.toISOString()}`
      );

      try {
        const snoCol = await this._col("serialNoconfig");
        const serialConfig = await snoCol.findOne({});
        if (serialConfig && serialConfig.resetInterval === "daily") {
          await snoCol.updateOne(
            {},
            {
              $set: {
                currentValue: lastUsedAfterReset.toString(),
                lastReset: now,
              },
            }
          );
          logger.info("Global serialNoconfig also updated for compatibility");
        }
      } catch (compatError) {
        logger.warn("⚠️ Failed to update serialNoconfig (compat only):", compatError);
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
      const configCol = await this._col("config");
      const configData = await configCol.findOne({});

      if (
        configData &&
        configData.currentModelConfig &&
        configData.currentModelConfig.modelNumber
      ) {
        const freshModelNumber = configData.currentModelConfig.modelNumber;
        logger.info(
          `✅ FRESH MODEL from DB: ${freshModelNumber} (was cached as: ${this.currentModelNumber})`
        );
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

      const serialCol = await this._col("modelSerialConfig");

      const modelConfig = await serialCol.findOne({
        modelNumber: modelNumber || "default",
      });

      if (modelConfig) {
        logger.info(
          `✅ Found model-specific serial config for ${modelNumber}: currentValue=${modelConfig.currentValue}, lastReset=${modelConfig.lastReset}`
        );

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

        if (modelConfig.lastReset) {
          this.lastResetDate = new Date(modelConfig.lastReset);
        }

        return modelConfig;
      } else {
        logger.info(
          `ℹ️ No model-specific config found for ${modelNumber}, will create on first use`
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

      const serialCol = await this._col("modelSerialConfig");

      const existingConfig = await serialCol.findOne({
        modelNumber: modelNumber,
      });

      const dynamicStartingSerial = await this.getModelStartingSerial();

      const now = new Date();

      const updateData = {
        modelNumber: modelNumber,
        currentValue: usedSerialNumber.toString(),
        lastUpdated: now,
        startingSerial: dynamicStartingSerial,
        updatedAt: now,
      };

      if (existingConfig && existingConfig.lastReset) {
        updateData.lastReset = existingConfig.lastReset;
      }

      const result = await serialCol.updateOne(
        { modelNumber: modelNumber },
        { $set: updateData },
        { upsert: true }
      );

      logger.info(
        `✅ Serial saved: Model=${modelNumber}, lastUsed=${updateData.currentValue}, matched=${result.matchedCount}, upserted=${result.upsertedCount}`
      );

      try {
        await this._setLocalModelState(modelNumber, {
          currentValue: updateData.currentValue,
          startingSerial: updateData.startingSerial,
          lastReset: updateData.lastReset ? new Date(updateData.lastReset) : undefined,
          lastUpdated: updateData.lastUpdated,
          updatedAt: updateData.updatedAt.toISOString(),
        });
      } catch (localSyncErr) {
        logger.warn("⚠️ Failed to sync local serial cache:", localSyncErr);
      }
    } catch (error) {
      logger.error("❌ Error saving used serial number to MongoDB:", error);
      try {
        const modelNumber =
          this.currentModelNumber ||
          (await this.getCurrentModelNumber()) ||
          "default";
        const now = new Date();
        const local = await this._getLocalModelState(modelNumber);
        await this._setLocalModelState(modelNumber, {
          currentValue: usedSerialNumber.toString(),
          startingSerial: local?.startingSerial ?? (await this.getModelStartingSerial()),
          lastReset: local?.lastReset ?? undefined,
          lastUpdated: now,
          updatedAt: now.toISOString(),
        });
        logger.warn(
          `⚠️ MongoDB unavailable; saved used serial to local cache: model=${modelNumber}, lastUsed=${usedSerialNumber}`
        );
        return;
      } catch (localErr) {
        logger.error("❌ Failed to save used serial to local cache:", localErr);
        throw error;
      }
    }
  }

  async saveCurrentSerialNumber() {
    // We don't need this method since we're using the records collection
    // for tracking model-wise serial numbers
    logger.info("Serial number tracking handled through records collection");
  }

  async fixModelSerialConfigurations() {
    try {
      logger.info("🔧 Fixing existing model serial configurations...");

      const serialCol = await this._col("modelSerialConfig");

      const allModelConfigs = await serialCol.find({}).toArray();

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

        if (needsUpdate) {
          await serialCol.updateOne(
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

  async checkAllModelsStatus() {
    try {
      logger.info("📊 Checking status of all model configurations...");

      const serialCol = await this._col("modelSerialConfig");

      const allModelConfigs = await serialCol.find({}).toArray();

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
