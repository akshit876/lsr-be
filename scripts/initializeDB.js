import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const MONGODB_URI = "mongodb://localhost:27017";

async function initializeDatabase() {
  try {
    const client = await MongoClient.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    // Use only main-data database
    const mainDataDb = client.db("main-data");

    // Define all collections to be created in main-data
    const collections = {
      // Original main-data collections
      config: "config",
      records: "records",
      serialNoConfig: "serialNoConfig",

      // Moved from laserU
      partnumberconfigs: "partnumberconfigs",
      shiftconfigs: "shiftconfigs",
      users: "users",
    };

    // Create all collections in main-data
    await Promise.all(
      Object.values(collections).map((collectionName) =>
        mainDataDb.createCollection(collectionName).catch((error) => {
          if (error.code !== 48) {
            // Ignore "collection already exists" error
            throw error;
          }
        })
      )
    );

    // Initialize Admin User in main-data.users
    const adminExists = await mainDataDb
      .collection(collections.users)
      .findOne({ email: "super" });

    if (!adminExists) {
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
    } else {
      console.log("Admin user already exists in main-data.users");
    }

    // Add sample partnumber config
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

    const partNumberConfigExists = await mainDataDb
      .collection(collections.partnumberconfigs)
      .findOne({
        "fields.fieldName": "Model Number",
        "fields.value": "Sample",
      });

    if (!partNumberConfigExists) {
      await mainDataDb
        .collection(collections.partnumberconfigs)
        .insertOne(samplePartNumberConfig);
      console.log("Sample partnumber config created successfully");
    } else {
      console.log("Sample partnumber config already exists");
    }

    // Add sample shift config
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

    const shiftConfigExists = await mainDataDb
      .collection(collections.shiftconfigs)
      .findOne({ totalHours: 24 });

    if (!shiftConfigExists) {
      await mainDataDb
        .collection(collections.shiftconfigs)
        .insertOne(sampleShiftConfig);
      console.log("Sample shift config created successfully");
    } else {
      console.log("Sample shift config already exists");
    }

    console.log("Database initialization completed successfully");
    await client.close();
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
}

initializeDatabase();
