import SerialNumberService from "./services/serialNumber.js";
import MongoDBService from "./services/mongoDbService.js";

async function testRuntimeModelSwitching() {
  try {
    console.log("🧪 Testing runtime model switching...");

    // Initialize the service
    await SerialNumberService.initialize("main-data", "records");

    // Show initial state
    await MongoDBService.connect("main-data", "config");
    const initialConfig = await MongoDBService.collection.findOne({});
    console.log(
      `📋 Initial model: ${initialConfig?.currentModelConfig?.modelNumber}`
    );

    // Get a serial number with initial model
    const serial1 = await SerialNumberService.getNextDecSerialNumber2();
    console.log(`🔢 Serial with initial model: ${serial1}`);

    // Simulate model change in database (like from UI)
    console.log("\n🔄 Simulating model change in database...");
    const newModelNumber =
      initialConfig?.currentModelConfig?.modelNumber === "CMB-877"
        ? "CMB-778"
        : "CMB-877";

    await MongoDBService.collection.updateOne(
      {},
      {
        $set: {
          "currentModelConfig.modelNumber": newModelNumber,
          updatedAt: new Date(),
        },
      }
    );

    console.log(`✅ Changed model to: ${newModelNumber}`);

    // Force refresh to clear any cached data
    await SerialNumberService.forceRefresh();

    // Get serial numbers with new model
    const serial2 = await SerialNumberService.getNextDecSerialNumber2();
    console.log(`🔢 First serial with new model: ${serial2}`);

    const serial3 = await SerialNumberService.getNextDecSerialNumber2();
    console.log(`🔢 Second serial with new model: ${serial3}`);

    // Check modelSerialConfig to see what was saved
    await MongoDBService.connect("main-data", "modelSerialConfig");
    const modelConfigs = await MongoDBService.collection.find({}).toArray();

    console.log("\n📊 Current modelSerialConfig state:");
    for (const config of modelConfigs) {
      console.log(
        `   ${config.modelNumber}: currentValue=${config.currentValue}, startingSerial=${config.startingSerial}`
      );
    }

    console.log("\n✅ Runtime model switching test completed!");
    console.log("🔍 Check the logs above to verify:");
    console.log("   1. Model change was detected");
    console.log("   2. Correct serial sequence was used for new model");
    console.log("   3. Each model maintains separate serial tracking");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
  process.exit(0);
}

testRuntimeModelSwitching();
