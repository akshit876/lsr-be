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

  // Enhanced method for fetching records with pagination and filtering
  async getRecordsForUI(options = {}) {
    try {
      const {
        limit = 500, // Number of records to fetch
        skip = 0, // Number of records to skip (for pagination)
        modelNumber = null, // Filter by specific model
        startDate = null, // Date range start
        endDate = null, // Date range end
        sortBy = "Timestamp", // Field to sort by
        sortOrder = -1, // -1 for descending, 1 for ascending
        includeFields = null, // Specific fields to include (for performance)
      } = options;

      // Build query filter
      const query = {};

      if (modelNumber) {
        query.ModelNumber = modelNumber;
      }

      if (startDate || endDate) {
        query.Timestamp = {};
        if (startDate) {
          query.Timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          query.Timestamp.$lte = new Date(endDate);
        }
      }

      // Build projection (field selection) for performance
      const projection = {};
      if (includeFields && Array.isArray(includeFields)) {
        includeFields.forEach((field) => {
          projection[field] = 1;
        });
      }

      logger.info(
        `🔍 Fetching records for UI: limit=${limit}, skip=${skip}, query=${JSON.stringify(query)}`
      );

      // Execute query with optimizations
      const cursor = this.collection
        .find(query, Object.keys(projection).length > 0 ? { projection } : {})
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit);

      const records = await cursor.toArray();

      // Get total count for pagination info (separate query for performance)
      const totalCount = await this.collection.countDocuments(query);

      logger.info(
        `✅ Fetched ${records.length} records out of ${totalCount} total`
      );

      return {
        data: records,
        pagination: {
          total: totalCount,
          limit: limit,
          skip: skip,
          hasMore: skip + records.length < totalCount,
          currentPage: Math.floor(skip / limit) + 1,
          totalPages: Math.ceil(totalCount / limit),
        },
      };
    } catch (error) {
      logger.error("❌ Error fetching records for UI:", error);
      throw error;
    }
  }

  // Optimized method for real-time updates (get recent records)
  async getRecentRecords(limit = 50, modelNumber = null) {
    try {
      const query = {};
      if (modelNumber) {
        query.ModelNumber = modelNumber;
      }

      const records = await this.collection
        .find(query)
        .sort({ Timestamp: -1 })
        .limit(limit)
        .toArray();

      logger.info(`📊 Fetched ${records.length} recent records`);
      return records;
    } catch (error) {
      logger.error("❌ Error fetching recent records:", error);
      throw error;
    }
  }

  // Enhanced method for sending data to client with better pagination support
  async sendPaginatedDataToClient(
    socket,
    dbName,
    collectionName,
    options = {}
  ) {
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
          `Connecting to ${dbName}.${collectionName} for paginated client data...`
        );
        await this.connect(dbName, collectionName);
      }

      // Use the enhanced getRecordsForUI method
      const result = await this.getRecordsForUI(options);

      if (result.data.length === 0) {
        logger.info(`No data found in ${dbName}.${collectionName} collection.`);
        socket.emit("paginated-data", {
          data: [],
          pagination: result.pagination,
          query: options,
        });
        return;
      }

      // Transform the data for UI consumption
      const transformedData = result.data.map((item) => ({
        _id: item._id,
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

      // Send the paginated data to the client
      socket.emit("paginated-data", {
        data: transformedData,
        pagination: result.pagination,
        query: options,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `✅ Emitted ${transformedData.length} paginated records from ${dbName}.${collectionName} to client: ${socket.id}`
      );
    } catch (error) {
      logger.error("❌ Error in sendPaginatedDataToClient: ", error.message);
      socket.emit("error", {
        message: "Error fetching paginated data from database",
        details: error.message,
      });
    }
  }
}

export default new MongoDBService();
