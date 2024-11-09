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

      // Fetch data from MongoDB, sorted in descending order by Timestamp
      const data = await this.collection
        .find({})
        .sort({ Timestamp: -1 })
        .limit(100)
        .toArray();

      if (data.length === 0) {
        logger.info("No data found in MongoDB collection.");
        socket.emit("mongodb-data", { data: [] });
        return;
      }

      // Transform the data
      const transformedData = data.map((item) => ({
        Timestamp: item?.Timestamp,
        SerialNumber: item?.SerialNumber,
        MarkingData: item?.MarkingData,
        ScannerData: item?.ScannerData,
        Shift: item?.Shift,
        Result: item?.Result,
        User: item?.User,
        Date: item?.Date,
      }));

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
      const db = this.client.db("laserU");
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
}

export default new MongoDBService();
