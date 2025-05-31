import { MongoClient } from "mongodb";
import logger from "../logger.js";
// import logger from "./logger.js";

class MongoDBService {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
  }

  async connect(dbName, collectionName) {
    try {
      const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db(dbName);
      this.collection = this.db.collection(collectionName);
      logger.info(`Connected successfully to MongoDB database: ${dbName}`);
    } catch (error) {
      console.error({ error });
      logger.error("MongoDB connection error:", error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      logger.info("Disconnected from MongoDB");
    }
  }

  async insertRecord(data, dbName, collectionName) {
    try {
      // If database and collection parameters are provided, ensure we're connected to the right one
      let targetCollection = this.collection;
      if (dbName && collectionName) {
        // Check if we need to switch to a different database/collection
        if (
          !this.db ||
          this.db.databaseName !== dbName ||
          !this.collection ||
          this.collection.collectionName !== collectionName
        ) {
          await this.connect(dbName, collectionName);
          targetCollection = this.collection;
        }
      }

      const result = await targetCollection.insertOne(data);
      logger.info(
        `Inserted record with ID: ${result.insertedId} in ${dbName}.${collectionName}`
      );
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

  async updateLastRecord(filter, updateData, dbName, collectionName) {
    try {
      // If we need to use a different database/collection, connect to it
      let targetCollection = this.collection;
      if (
        dbName &&
        collectionName &&
        (this.db.databaseName !== dbName ||
          this.collection.collectionName !== collectionName)
      ) {
        await this.connect(dbName, collectionName);
        targetCollection = this.collection;
      }

      // Find the most recent record matching the filter and update it
      const result = await targetCollection.findOneAndUpdate(
        filter,
        updateData,
        {
          sort: { Timestamp: -1 }, // Sort by timestamp descending to get the most recent
          returnDocument: "after", // Return the updated document
        }
      );

      if (result) {
        logger.info(
          `Updated last record for filter: ${JSON.stringify(filter)}`
        );
        return result;
      } else {
        logger.warn(
          `No record found to update for filter: ${JSON.stringify(filter)}`
        );
        return null;
      }
    } catch (error) {
      logger.error("Error updating last record:", error);
      throw error;
    }
  }

  async sendMongoDbDataToClient(socket, dbName, collectionName) {
    try {
      // Always ensure we're connected to the correct database and collection
      if (!dbName || !collectionName) {
        throw new Error("Database name and collection name are required");
      }

      // Check if we need to connect/reconnect to the correct database/collection
      if (
        !this.db ||
        this.db.databaseName !== dbName ||
        !this.collection ||
        this.collection.collectionName !== collectionName
      ) {
        logger.info(
          `Connecting to ${dbName}.${collectionName} for client data...`
        );
        await this.connect(dbName, collectionName);
      }

      // Fetch data from MongoDB, sorted in descending order by Timestamp
      const data = await this.collection
        .find({})
        .sort({ Timestamp: -1 })
        .limit(100)
        .toArray();

      if (data.length === 0) {
        logger.info(`No data found in ${dbName}.${collectionName} collection.`);
        socket.emit("mongodb-data", { data: [] });
        return;
      }

      // Transform the data
      const transformedData = data.map((item) => ({
        Timestamp: item?.Timestamp,
        SerialNumber: item?.SerialNumber,
        MarkingData: item?.MarkingData,
        ScannerData: item?.ScannerData,
        ModelNumber: item?.ModelNumber,
        User: item?.User,
        Grade: item?.Grade,
        CurrentId: item?.CurrentId,
        Shift: item?.Shift,
        Result: item?.Result,
        Date: item?.Date,
      }));

      // Send the data to the client
      socket.emit("csv-data", { data: transformedData });
      logger.info(
        `Emitted data from ${dbName}.${collectionName} to client: ${socket.id}`
      );
    } catch (error) {
      console.error({ error });
      logger.error("Error in sendMongoDbDataToClient: ", error.message);
      socket.emit("error", { message: "Error fetching data from database" });
    }
  }
}

export default new MongoDBService();
