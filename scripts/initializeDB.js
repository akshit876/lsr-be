import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const MONGODB_URI = "mongodb://localhost:27017";

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
      serialNoConfig: "serialNoConfig",
    };

    // Create Collections for LaserU
    await Promise.all([
      laserUDb.createCollection(laserUCollections.partnumberconfigs),
      laserUDb.createCollection(laserUCollections.shiftconfigs),
      laserUDb.createCollection(laserUCollections.users),
    ]);

    // Create Collections for Main-Data
    await Promise.all([
      mainDataDb.createCollection(mainDataCollections.config),
      mainDataDb.createCollection(mainDataCollections.records),
      mainDataDb.createCollection(mainDataCollections.serialNoConfig),
    ]);

    // Initialize Admin User
    const adminExists = await laserUDb
      .collection(laserUCollections.users)
      .findOne({ email: "super" });

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("admin", 10);

      await laserUDb.collection(laserUCollections.users).insertOne({
        name: "Super Admin",
        email: "super",
        password: hashedPassword,
        role: "admin",
        isVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log("Admin user created successfully");
    } else {
      console.log("Admin user already exists");
    }

    console.log("Database initialization completed successfully");
    await client.close();
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
}

initializeDatabase();
