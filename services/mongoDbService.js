import { MongoClient } from "mongodb";
import logger from "../logger.js";
import config from "../config/config.js";
// import logger from "./logger.js";

class MongoDBService {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
  }

  async connect(database, collection) {
    const maxRetries = 5;
    const retryDelay = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(
          `Attempting to connect to MongoDB (attempt ${attempt}/${maxRetries})...`
        );
        this.client = await MongoClient.connect(config.mongodb.url);
        this.db = this.client.db(database);
        this.collection = this.db.collection(collection);
        logger.success("MongoDB connected successfully");
        return;
      } catch (error) {
        logger.error(`MongoDB connection error: ${error.message}`);
        if (attempt === maxRetries) {
          throw error;
        }
        logger.info(`Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      logger.info("Disconnected from MongoDB");
    }
  }

  async insertRecord(data, dbName = "main-data", collectionName = "records") {
    try {
      // Check if we need to connect or reconnect with the specified db and collection
      if (
        !this.collection ||
        this.db?.databaseName !== dbName ||
        this.collection.collectionName !== collectionName
      ) {
        await this.connect(dbName, collectionName);
      }

      const result = await this.collection.insertOne(data);
      logger.info(`Inserted record with ID: ${result.insertedId}`);
      return result.insertedId;
    } catch (error) {
      logger.error("Error inserting record:", error);
      throw error;
    }
  }

  async getLatestSerialNumber() {
    try {
      const latestRecord = await this.collection
        .find()
        .sort({ Timestamp: -1 })
        .limit(1)
        .toArray();
      if (latestRecord.length > 0) {
        return parseInt(latestRecord[0].SerialNumber, 10);
      }
      return 0;
    } catch (error) {
      logger.error("Error getting latest serial number:", error);
      throw error;
    }
  }

  async getRecordsByDateRange(startDate, endDate) {
    try {
      return await this.collection
        .find({
          Timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) },
        })
        .toArray();
    } catch (error) {
      logger.error("Error getting records by date range:", error);
      throw error;
    }
  }

  async getRecordsByShift(shift, date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      return await this.collection
        .find({
          Shift: shift,
          Timestamp: { $gte: startOfDay, $lte: endOfDay },
        })
        .toArray();
    } catch (error) {
      logger.error("Error getting records by shift:", error);
      throw error;
    }
  }

  async updateRecord(id, updateData) {
    try {
      const result = await this.collection.updateOne(
        { _id: id },
        { $set: updateData }
      );
      logger.info(`Updated ${result.modifiedCount} record(s)`);
      return result.modifiedCount;
    } catch (error) {
      logger.error("Error updating record:", error);
      throw error;
    }
  }

  async sendMongoDbDataToClient(socket) {
    try {
      // Always use main-data and records
      const DB_NAME = "main-data";
      const COLLECTION_NAME = "records";

      // Check if we're connected to the database, if not, try to connect
      if (!this.collection) {
        logger.info(
          "MongoDB connection not established. Attempting to connect..."
        );
        await this.connect(DB_NAME, COLLECTION_NAME);
      } else {
        // Even if connected, ensure we're using the correct database and collection
        this.db = this.client.db(DB_NAME);
        this.collection = this.db.collection(COLLECTION_NAME);
        logger.info("Ensuring connection to main-data.records collection");
      }

      // Get current time and today's 6 AM
      const now = new Date();
      const todaySixAM = new Date(now);
      todaySixAM.setHours(6, 0, 0, 0);

      // If current time is before 6 AM, use previous day's 6 AM
      if (now < todaySixAM) {
        todaySixAM.setDate(todaySixAM.getDate() - 1);
      }

      // First, get the total counts for each day window
      const dayWindowCounts = await this.collection
        .aggregate([
          {
            $addFields: {
              dayWindow: {
                $let: {
                  vars: {
                    timestamp: "$Timestamp",
                    sixAM: {
                      $dateFromParts: {
                        year: { $year: "$Timestamp" },
                        month: { $month: "$Timestamp" },
                        day: { $dayOfMonth: "$Timestamp" },
                        hour: 6,
                      },
                    },
                  },
                  in: {
                    $cond: {
                      if: { $lt: ["$Timestamp", "$$sixAM"] },
                      then: {
                        $subtract: [
                          "$$sixAM",
                          { $multiply: [24 * 60 * 60 * 1000, 1] },
                        ],
                      },
                      else: "$$sixAM",
                    },
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: "$dayWindow",
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();

      // Create a map of day windows to their total counts
      const dayWindowTotalCounts = new Map(
        dayWindowCounts.map(({ _id, count }) => [_id.getTime(), count])
      );

      // Now fetch the limited data
      const data = await this.collection
        .find({})
        .sort({ Timestamp: -1 })
        .limit(700)
        .toArray();

      // Transform the data with correct IDs
      const transformedData = await Promise.all(
        data.map(async (item) => {
          const itemTimestamp = new Date(item?.Timestamp);
          let windowStart = new Date(itemTimestamp);
          windowStart.setHours(6, 0, 0, 0);
          if (itemTimestamp < windowStart) {
            windowStart.setDate(windowStart.getDate() - 1);
          }

          const totalCount =
            dayWindowTotalCounts.get(windowStart.getTime()) || 0;
          const position = await this.collection.countDocuments({
            Timestamp: {
              $gte: windowStart,
              $lt: itemTimestamp,
            },
          });

          return {
            Id: position + 1,
            Timestamp: item?.Timestamp,
            SerialNumber: item?.SerialNumber,
            MarkingData: item?.MarkingData,
            ScannerData: item?.ScannerData,
            Shift: item?.Shift,
            Result: item?.Result,
            User: item?.User,
            Grade: item?.Grade,
            Date: item?.Date,
          };
        })
      );

      // Send the data to the client
      socket.emit("csv-data", { data: transformedData });
      logger.info(`Emitted MongoDB data to client: ${socket.id}`);
    } catch (error) {
      logger.error("Error in sendMongoDbDataToClient: ", error.message);
      socket.emit("error", { message: "Error fetching data from database" });
    }
  }

  async getUserDetails(userId = null) {
    try {
      // Connect to the laserU database
      const db = this.client.db("main-data");
      const collection = db.collection("usersessionlogs");

      // Find the most recent session log for the given userId, sorted by loginTime
      const userDetails = await collection
        .find({})
        .sort({ loginTime: -1 }) // Sort by loginTime in descending order
        .limit(1) // Limit to the most recent entry
        .toArray();

      if (userDetails.length === 0) {
        throw new Error(`User with ID ${userId} not found`);
      }

      const latestUserDetails = userDetails[0];
      return {
        email: latestUserDetails.email,
        role: latestUserDetails.role,
        loginTime: latestUserDetails.loginTime,
        userAgent: latestUserDetails.userAgent,
        ipAddress: latestUserDetails.ipAddress,
        status: latestUserDetails.status,
      };
    } catch (error) {
      logger.error("Error fetching user details:", error);
      throw error;
    }
  }

  async updateLastRecord(query, update, dbName, collectionName) {
    try {
      const collection = this.db.collection(collectionName);
      const result = await collection.findOneAndUpdate(query, update, {
        sort: { Timestamp: -1 }, // Sort by timestamp to get most recent
        returnDocument: "after", // Return the updated document
      });
      return result;
    } catch (error) {
      logger.error("Error updating record:", error);
      throw error;
    }
  }
}

export default new MongoDBService();
