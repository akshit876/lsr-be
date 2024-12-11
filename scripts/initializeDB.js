import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import process from "process";

const MONGODB_URI = "mongodb://localhost:27017";

async function importJsonData(db, collectionName, jsonFilePath) {
  try {
    const jsonContent = await fs.readFile(jsonFilePath, 'utf8');
    const data = JSON.parse(jsonContent);
    
    if (data.length > 0) {
      await db.collection(collectionName).insertMany(data);
      console.log(`Imported data into ${collectionName} successfully`);
    }
  } catch (error) {
    if (error.code !== 11000) { // Ignore duplicate key errors
      console.error(`Error importing ${collectionName} data:`, error);
      throw error;
    }
  }
}

async function initializeDatabase() {
  try {
    const client = await MongoClient.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const mainDataDb = client.db("main-data");
    const collections = {
      config: "config",
      records: "records",
      serialNoConfig: "serialNoconfig",
      partnumberconfigs: "partnumberconfigs",
      shiftconfigs: "shiftconfigs",
      users: "users",
    };

    // Create collections
    await Promise.all(
      Object.values(collections).map((collectionName) =>
        mainDataDb.createCollection(collectionName).catch((error) => {
          if (error.code !== 48) {
            throw error;
          }
        })
      )
    );

    // Import all JSON data
    const imports = [
      {
        collection: collections.config,
        file: 'main-data.config.json'
      },
      {
        collection: collections.partnumberconfigs,
        file: 'main-data.partnumberconfigs.json'
      },
      {
        collection: collections.shiftconfigs,
        file: 'main-data.shiftconfigs.json'
      },
      {
        collection: collections.users,
        file: 'main-data.users.json'
      },
      {
        collection: collections.serialNoConfig,
        file: 'main-data.serialNoconfig.json'
      },
    ];

    // Import all JSON files
    for (const imp of imports) {
      await importJsonData(
        mainDataDb,
        imp.collection,
        path.join(process.cwd(), 'dbInit', imp.file)
      );
    }

    // Skip creating default admin if users were imported
    const userCount = await mainDataDb.collection(collections.users).countDocuments();
    if (userCount === 0) {
      // Initialize Admin User only if no users exist
      const hashedPassword = await bcrypt.hash("admin", 10);
      await mainDataDb.collection(collections.users).insertOne({
        name: "Super Admin",
        email: "super",
        password: hashedPassword,
        role: "admin",
        isVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log("Admin user created successfully in main-data.users");
    }

    // Skip sample data if collections have data
    const partNumberConfigCount = await mainDataDb
      .collection(collections.partnumberconfigs)
      .countDocuments();
    const shiftConfigCount = await mainDataDb
      .collection(collections.shiftconfigs)
      .countDocuments();

    // Only add sample partnumber config if none exists
    if (partNumberConfigCount === 0) {
      const samplePartNumberConfig = {
        fields: [
          {
            fieldName: "Model Number",
            order: 999,
            isChecked: false,
            value: "Sample",
            maxLength: 20,
            isRequired: true,
          },
          // ... other fields ...
          {
            fieldName: "SHIFT",
            order: 12,
            isChecked: true,
            value: "",
            maxLength: 1,
            isRequired: true,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await mainDataDb
        .collection(collections.partnumberconfigs)
        .insertOne(samplePartNumberConfig);
      console.log("Sample partnumber config created successfully");
    }

    // Only add sample shift config if none exists
    if (shiftConfigCount === 0) {
      const sampleShiftConfig = {
        shifts: [
          {
            shiftId: "1",
            name: "AaA",
            startTime: "06:00",
            endTime: "14:00",
            duration: 8,
          },
          {
            shiftId: "2",
            name: "BbB",
            startTime: "14:00",
            endTime: "22:00",
            duration: 8,
          },
          {
            shiftId: "3",
            name: "CcC",
            startTime: "22:00",
            endTime: "06:00",
            duration: 8,
          },
        ],
        totalHours: 24,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await mainDataDb
        .collection(collections.shiftconfigs)
        .insertOne(sampleShiftConfig);
      console.log("Sample shift config created successfully");
    }

    console.log("Database initialization completed successfully");
    await client.close();
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
}

initializeDatabase();
