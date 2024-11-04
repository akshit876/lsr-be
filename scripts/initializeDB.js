const { MongoClient } = require("mongodb");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI;

async function initializeDatabase() {
  try {
    const client = await MongoClient.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    // Initialize LaserU Database
    const laserUDb = client.db("laserU");
    const laserUCollections = {
      partnumberconfigs: "partnumberconfigs",
      shiftconfigs: "shiftconfigs",
      users: "users",
    };

    // Initialize Main-Data Database
    const mainDataDb = client.db("main-data");
    const mainDataCollections = {
      config: "config",
      records: "records",
    };

    // Create Collections with Indexes for LaserU
    await Promise.all([
      // Partnumber Configs Collection
      laserUDb.createCollection(laserUCollections.partnumberconfigs),
      laserUDb
        .collection(laserUCollections.partnumberconfigs)
        .createIndex({ partnumber: 1 }, { unique: true }),

      // Shift Configs Collection
      laserUDb.createCollection(laserUCollections.shiftconfigs),
      laserUDb
        .collection(laserUCollections.shiftconfigs)
        .createIndex({ shiftName: 1 }),

      // Users Collection
      laserUDb.createCollection(laserUCollections.users),
      laserUDb
        .collection(laserUCollections.users)
        .createIndex({ username: 1 }, { unique: true }),
      laserUDb
        .collection(laserUCollections.users)
        .createIndex({ email: 1 }, { unique: true }),
    ]);

    // Create Collections with Indexes for Main-Data
    await Promise.all([
      // Config Collection
      mainDataDb.createCollection(mainDataCollections.config),
      mainDataDb
        .collection(mainDataCollections.config)
        .createIndex({ key: 1 }, { unique: true }),

      // Records Collection
      mainDataDb.createCollection(mainDataCollections.records),
      mainDataDb
        .collection(mainDataCollections.records)
        .createIndex({ timestamp: 1 }),
      mainDataDb
        .collection(mainDataCollections.records)
        .createIndex({ partnumber: 1 }),
    ]);

    // Insert Default Settings if needed
    await laserUDb.collection(laserUCollections.shiftconfigs).updateOne(
      { shiftName: "default" },
      {
        $setOnInsert: {
          startTime: "06:00",
          endTime: "14:00",
          // Add other default shift settings
        },
      },
      { upsert: true }
    );

    console.log("Database initialization completed successfully");
    await client.close();
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
}

// Run the initialization
initializeDatabase();
