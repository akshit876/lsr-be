import MongoDBService from "./services/mongoDbService.js";

async function cleanupConfigDB() {
  try {
    console.log("🧹 Cleaning up config database...");

    // Connect to config collection
    await MongoDBService.connect("main-data", "config");

    // Get all documents in config collection
    const allDocs = await MongoDBService.collection.find({}).toArray();

    console.log(`Found ${allDocs.length} documents in config collection`);

    for (const doc of allDocs) {
      console.log("\n📋 Document:", doc._id);

      // Check if this document has serial tracking data that shouldn't be here
      if (
        doc.modelNumber &&
        doc.currentValue &&
        doc.startingSerial &&
        !doc.currentModelConfig
      ) {
        console.log(
          `❌ FOUND MISPLACED SERIAL DATA: modelNumber=${doc.modelNumber}, currentValue=${doc.currentValue}`
        );
        console.log("   This data should be in modelSerialConfig, not config!");

        // Move this data to modelSerialConfig
        await MongoDBService.connect("main-data", "modelSerialConfig");

        const serialData = {
          modelNumber: doc.modelNumber,
          currentValue: doc.currentValue,
          startingSerial: doc.startingSerial,
          lastUpdated: doc.lastUpdated || new Date(),
          movedFromConfig: new Date(), // Mark when we moved it
        };

        // Save to correct collection
        await MongoDBService.collection.updateOne(
          { modelNumber: doc.modelNumber },
          { $set: serialData },
          { upsert: true }
        );

        console.log(
          `✅ Moved serial data to modelSerialConfig for model: ${doc.modelNumber}`
        );

        // Remove from config collection
        await MongoDBService.connect("main-data", "config");
        await MongoDBService.collection.deleteOne({ _id: doc._id });

        console.log(`🗑️ Removed misplaced data from config collection`);
      } else if (doc.currentModelConfig) {
        console.log(`✅ Valid config document with currentModelConfig`);

        // Remove any serial tracking fields that shouldn't be in config
        const fieldsToRemove = {};
        let needsUpdate = false;

        if (doc.currentPartNumber) {
          fieldsToRemove.currentPartNumber = "";
          needsUpdate = true;
          console.log(
            `   Removing currentPartNumber: ${doc.currentPartNumber}`
          );
        }

        if (doc.partNo && doc.partNo.includes(";")) {
          // If partNo looks like scan data, remove it
          fieldsToRemove.partNo = "";
          needsUpdate = true;
          console.log(`   Removing scan data from partNo: ${doc.partNo}`);
        }

        if (doc.selectedAt || doc.selectedBy || doc.updatedAt) {
          if (doc.selectedAt) fieldsToRemove.selectedAt = "";
          if (doc.selectedBy) fieldsToRemove.selectedBy = "";
          if (doc.updatedAt) fieldsToRemove.updatedAt = "";
          needsUpdate = true;
          console.log(`   Removing scan metadata fields`);
        }

        if (needsUpdate) {
          await MongoDBService.collection.updateOne(
            { _id: doc._id },
            { $unset: fieldsToRemove }
          );
          console.log(`🧽 Cleaned config document`);
        }
      } else {
        console.log(`❓ Unknown document structure`);
      }
    }

    // Show final state
    console.log("\n📊 Final config collection state:");
    await MongoDBService.connect("main-data", "config");
    const finalDocs = await MongoDBService.collection.find({}).toArray();

    for (const doc of finalDocs) {
      if (doc.currentModelConfig) {
        console.log(
          `✅ Config: modelNumber=${doc.currentModelConfig.modelNumber}`
        );
      } else {
        console.log(`❓ Document: ${JSON.stringify(Object.keys(doc))}`);
      }
    }

    console.log("\n✅ Config database cleanup completed!");
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
  }
  process.exit(0);
}

cleanupConfigDB();
