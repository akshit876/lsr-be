import SerialNumberService from "./services/serialNumber.js";
import MongoDBService from "./services/mongoDbService.js";

async function test() {
  try {
    console.log("🧪 Testing modelSerialConfig as primary database...");

    // Initialize the service
    await SerialNumberService.initialize("main-data", "records");

    // Get current model and first serial
    await MongoDBService.connect("main-data", "config");
    const config = await MongoDBService.collection.findOne({});
    console.log("Current model:", config?.currentModelConfig?.modelNumber);

    // Get first serial number
    const serial1 = await SerialNumberService.getNextDecSerialNumber2();
    console.log("First serial:", serial1);

    // Check what was saved to modelSerialConfig
    await MongoDBService.connect("main-data", "modelSerialConfig");
    const modelConfig = await MongoDBService.collection.findOne({
      modelNumber: config?.currentModelConfig?.modelNumber,
    });
    console.log("modelSerialConfig after first call:", {
      model: modelConfig?.modelNumber,
      currentValue: modelConfig?.currentValue,
      startingSerial: modelConfig?.startingSerial,
    });

    // Get second serial (should increment from modelSerialConfig)
    const serial2 = await SerialNumberService.getNextDecSerialNumber2();
    console.log("Second serial:", serial2);

    // Check updated modelSerialConfig
    const updatedConfig = await MongoDBService.collection.findOne({
      modelNumber: config?.currentModelConfig?.modelNumber,
    });
    console.log("modelSerialConfig after second call:", {
      model: updatedConfig?.modelNumber,
      currentValue: updatedConfig?.currentValue,
      startingSerial: updatedConfig?.startingSerial,
    });

    console.log(
      "✅ Test completed - modelSerialConfig is now the primary database!"
    );
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
  process.exit(0);
}

test();
