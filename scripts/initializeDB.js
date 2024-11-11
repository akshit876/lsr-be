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

    console.log("Database initialization completed successfully");
    await client.close();
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
}

initializeDatabase();
