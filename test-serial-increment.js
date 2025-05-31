import SerialNumberService from "./services/serialNumber.js";

async function test() {
  try {
    console.log("🧪 Testing serial number increment...");

    // Initialize the service
    await SerialNumberService.initialize("main-data", "records");

    // Get next serial numbers multiple times
    console.log(
      "First call:",
      await SerialNumberService.getNextDecSerialNumber2()
    );
    console.log(
      "Second call:",
      await SerialNumberService.getNextDecSerialNumber2()
    );
    console.log(
      "Third call:",
      await SerialNumberService.getNextDecSerialNumber2()
    );

    console.log("✅ Test completed");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
  process.exit(0);
}

test();
