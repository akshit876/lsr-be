import { MongoClient } from "mongodb";
import logger from "../../logger.js";
import { DB_CONFIG } from "./constants.js";

export class DatabaseManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
  }

  async initialize() {
    try {
      this.client = await MongoClient.connect(DB_CONFIG.DEFAULT_URI);
      this.db = this.client.db(DB_CONFIG.DEFAULT_DB);
      this.collection = this.db.collection(DB_CONFIG.DEFAULT_COLLECTION);
      logger.success("Database connection established");
    } catch (error) {
      logger.error("Failed to initialize database:", error);
      throw error;
    }
  }

  async saveRecord({
    partNumber,
    scannerData,
    grading,
    cycleCount,
    dayId,
    success,
  }) {
    try {
      const record = {
        timestamp: new Date(),
        partNumber,
        scannerData,
        grading,
        cycleCount,
        dayId,
        success,
      };

      await this.collection.insertOne(record);
      logger.info("Record saved to database");
      return true;
    } catch (error) {
      logger.error("Error saving record to database:", error);
      throw error;
    }
  }

  async getDayId() {
    try {
      const lastRecord = await this.collection
        .find()
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();

      if (lastRecord.length === 0) return 1;

      const lastTimestamp = lastRecord[0].timestamp;
      const today6AM = new Date();
      today6AM.setHours(6, 0, 0, 0);

      if (lastTimestamp < today6AM) {
        return 1;
      }

      return (lastRecord[0].dayId || 0) + 1;
    } catch (error) {
      logger.error("Error getting day ID:", error);
      throw error;
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      logger.info("Database connection closed");
    }
  }
}
