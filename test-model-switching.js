import SerialNumberService from "./services/serialNumber.js";
import MongoDBService from "./services/mongoDbService.js";

async function test() {
  try {
    console.log("🧪 Testing model switching behavior...");

    // Initialize the service
    await SerialNumberService.initialize("main-data", "records");

    // Check current model and get a serial number
    console.log("=== Initial State ===");
    const serial1 = await SerialNumberService.getNextDecSerialNumber2();
    console.log("First serial:", serial1);

    // Get current model from config
    await MongoDBService.connect("main-data", "config");
    const config = await MongoDBService.collection.findOne({});
    console.log(
      "Current model from DB:",
      config?.currentModelConfig?.modelNumber
    );

    // Get another serial (should increment)
    const serial2 = await SerialNumberService.getNextDecSerialNumber2();
    console.log("Second serial:", serial2);

    // Check model serial config
    await MongoDBService.connect("main-data", "modelSerialConfig");
    const modelConfigs = await MongoDBService.collection.find({}).toArray();
    console.log(
      "Model serial configs:",
      modelConfigs.map((c) => ({
        model: c.modelNumber,
        currentValue: c.currentValue,
        startingSerial: c.startingSerial,
      }))
    );

    console.log("✅ Test completed");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
  process.exit(0);
}

test();
