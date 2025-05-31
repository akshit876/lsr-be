import SerialNumberService from "./services/serialNumber.js";

async function fixConfigs() {
  try {
    console.log("🔧 Starting model configuration fix...");

    // Initialize the service
    await SerialNumberService.initialize("main-data", "records");

    // Fix existing model configurations
    await SerialNumberService.fixModelSerialConfigurations();

    console.log("✅ Fix completed successfully!");
  } catch (error) {
    console.error("❌ Fix failed:", error);
  }
  process.exit(0);
}

fixConfigs();
