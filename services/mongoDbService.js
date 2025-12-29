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
      }

      logger.info("🔍 Fetching records for UI: limit=500");

      // Use aggregation to calculate day window position efficiently in ONE query
      const data = await this.collection
        .aggregate([
          // Sort by timestamp descending first
          { $sort: { Timestamp: -1 } },
          // Limit to 500 records
          { $limit: 500 },
          // Calculate day window (6 AM to 6 AM)
          {
            $addFields: {
              dayWindow: {
                $cond: {
                  if: { $lt: [{ $hour: "$Timestamp" }, 6] },
                  then: {
                    $dateFromParts: {
                      year: {
                        $year: {
                          $subtract: ["$Timestamp", 24 * 60 * 60 * 1000],
                        },
                      },
                      month: {
                        $month: {
                          $subtract: ["$Timestamp", 24 * 60 * 60 * 1000],
                        },
                      },
                      day: {
                        $dayOfMonth: {
                          $subtract: ["$Timestamp", 24 * 60 * 60 * 1000],
                        },
                      },
                      hour: 6,
                    },
                  },
                  else: {
                    $dateFromParts: {
                      year: { $year: "$Timestamp" },
                      month: { $month: "$Timestamp" },
                      day: { $dayOfMonth: "$Timestamp" },
                      hour: 6,
                    },
                  },
                },
              },
            },
          },
          // Calculate rank within each day window
          {
            $setWindowFields: {
              partitionBy: "$dayWindow",
              sortBy: { Timestamp: 1 },
              output: {
                dayPosition: { $rank: {} },
              },
            },
          },
          // Sort again by timestamp descending for final output
          { $sort: { Timestamp: -1 } },
        ])
        .toArray();

      logger.info(`✅ Fetched ${data.length} records`);

      // Transform the data - use dayPosition as Id (daily counter)
      const transformedData = data.map((item) => ({
        Id: item.dayPosition || 1,
        Timestamp: item?.Timestamp,
        SerialNumber: item?.SerialNumber,
        MarkingData: item?.MarkingData,
        ScannerData: item?.ScannerData,
        Shift: item?.Shift,
        Result: item?.Result,
        User: item?.User,
        Grade: item?.Grade,
        Date: item?.Date,
        remark: item?.remark,
      }));

      // Send the data to the client
      socket.emit("csv-data", { data: transformedData });
      logger.info(
        `✅ Emitted ${transformedData.length} records to client: ${socket.id}`
      );
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
