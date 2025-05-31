import SerialNumberService from "./services/serialNumber.js";
import MongoDBService from "./services/mongoDbService.js";

async function fixStartingSerials() {
  try {
    console.log("🔧 Fixing starting serials in modelSerialConfig...");

    // Initialize the service
    await SerialNumberService.initialize("main-data", "records");

    // Connect to modelSerialConfig collection
    await MongoDBService.connect("main-data", "modelSerialConfig");

    // Get all existing model configurations
    const allModelConfigs = await MongoDBService.collection.find({}).toArray();

    console.log(
      `Found ${allModelConfigs.length} model configurations to check`
    );

    for (const config of allModelConfigs) {
      const modelNumber = config.modelNumber;

      // Calculate the correct starting serial for this model
      let correctStartingSerial;
      if (modelNumber === "CMB-877") {
        correctStartingSerial = 7001;
      } else {
        correctStartingSerial = 1;
      }

      // Only update if the starting serial is different
      if (config.startingSerial !== correctStartingSerial) {
        console.log(
          `🔄 Updating model ${modelNumber}: startingSerial ${config.startingSerial} → ${correctStartingSerial}`
        );

        await MongoDBService.collection.updateOne(
          { modelNumber: modelNumber },
          {
            $set: {
              startingSerial: correctStartingSerial,
              lastUpdated: new Date(),
            },
          }
        );

        console.log(`✅ Updated model ${modelNumber} starting serial`);
      } else {
        console.log(
          `✅ Model ${modelNumber} already has correct startingSerial: ${correctStartingSerial}`
        );
      }
    }

    // Show final state
    console.log("\n📊 Final modelSerialConfig state:");
    const finalConfigs = await MongoDBService.collection.find({}).toArray();

    for (const config of finalConfigs) {
      console.log(
        `✅ Model ${config.modelNumber}: currentValue=${config.currentValue}, startingSerial=${config.startingSerial}`
      );
    }

    console.log("\n✅ Starting serials fix completed!");
  } catch (error) {
    console.error("❌ Fix failed:", error);
  }
  process.exit(0);
}

fixStartingSerials();
