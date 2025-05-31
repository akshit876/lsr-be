#!/usr/bin/env node

/**
 * Script to create missing configuration data in MongoDB
 */

import { MongoClient } from "mongodb";

const MONGO_URL = "mongodb://localhost:27017";
const DB_NAME = "main-data";

async function createConfiguration() {
  console.log("🔧 Creating Missing Configuration Data...");
  console.log("==========================================");

  const client = new MongoClient(MONGO_URL);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db(DB_NAME);
    const configCollection = db.collection("config");

    // Check if config already exists
    const existingConfig = await configCollection.findOne({});

    if (existingConfig) {
      console.log("⚠️ Configuration already exists:");
      console.log("   Part Number:", existingConfig.partNo || "Not set");
      console.log(
        "   Current Model Config:",
        existingConfig.currentModelConfig ? "Exists" : "Missing"
      );

      const answer = await askUser("Do you want to update it? (y/n): ");
      if (answer.toLowerCase() !== "y") {
        console.log("❌ Configuration update cancelled");
        return;
      }
    }

    // Create configuration data
    const configData = {
      partNo: "P5314775", // Default part number (you can change this)
      currentModelConfig: {
        modelName: "Default Model",
        fields: [
          {
            fieldName: "PART NO",
            order: 1,
            isChecked: true,
            value: "P5314775",
          },
          {
            fieldName: "SERIAL NUMBER",
            order: 2,
            isChecked: true,
            value: "",
          },
          {
            fieldName: "JULIAN DATE",
            order: 3,
            isChecked: true,
            value: "",
          },
          {
            fieldName: "SHIFT",
            order: 4,
            isChecked: true,
            value: "",
          },
          {
            fieldName: "YEAR",
            order: 5,
            isChecked: false,
            value: "",
          },
          {
            fieldName: "MONTH",
            order: 6,
            isChecked: false,
            value: "",
          },
          {
            fieldName: "DATE",
            order: 7,
            isChecked: false,
            value: "",
          },
        ],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert or update configuration
    await configCollection.replaceOne({}, configData, { upsert: true });

    console.log("✅ Configuration created successfully!");
    console.log("📋 Configuration Details:");
    console.log(`   - Part Number: ${configData.partNo}`);
    console.log(`   - Model: ${configData.currentModelConfig.modelName}`);
    console.log(
      `   - Active Fields: ${configData.currentModelConfig.fields
        .filter((f) => f.isChecked)
        .map((f) => f.fieldName)
        .join(", ")}`
    );

    // Test the configuration
    console.log("\n🧪 Testing configuration...");
    const testConfig = await configCollection.findOne({});

    if (testConfig && testConfig.partNo && testConfig.currentModelConfig) {
      console.log("✅ Configuration test passed!");
      console.log("   Your application should now find:");
      console.log(`   - Part Number: ${testConfig.partNo}`);
      console.log("   - Barcode field configuration: Available");
    } else {
      console.log("❌ Configuration test failed");
    }
  } catch (error) {
    console.error("❌ Error creating configuration:", error.message);
  } finally {
    await client.close();
    console.log("🔌 MongoDB connection closed");
  }
}

// Simple user input function
function askUser(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.once("data", (data) => {
      resolve(data.toString().trim());
    });
  });
}

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log("\n👋 Configuration script interrupted");
  process.exit(0);
});

// Main execution
async function main() {
  console.log("🎯 This script will create the missing configuration data");
  console.log(
    "   that your application needs for part numbers and barcode generation.\n"
  );

  try {
    await createConfiguration();
    console.log("\n🎉 Configuration setup completed!");
    console.log("💡 You can now restart your application with: npm run start");
  } catch (error) {
    console.error("\n❌ Configuration setup failed:", error.message);
    process.exit(1);
  }
}

main();
