import SerialNumberGeneratorService from "./services/serialNumber.js";
import {
  checkAllModelsStatus,
  fixModelConfigurations,
} from "./services/schedulerIntegration.js";
import logger from "./logger.js";

async function testResetFix() {
  try {
    console.log("\n🧪 ===== TESTING RESET FIX =====\n");

    // 1. Check current status of all models
    console.log("📊 1. Checking current status of all models...");
    const beforeStatus = await checkAllModelsStatus();
    console.log(
      "Current models status:",
      JSON.stringify(beforeStatus, null, 2)
    );

    // 2. Initialize the service
    console.log("\n🚀 2. Initializing Serial Number Service...");
    await SerialNumberGeneratorService.initialize("main-data", "records");

    // 3. Test reset status check for current model
    console.log("\n🔍 3. Checking reset status for current model...");
    const resetStatus = await SerialNumberGeneratorService.checkResetStatus();
    console.log("Reset status:", JSON.stringify(resetStatus, null, 2));

    // 4. Force a manual reset to test the mechanism
    console.log(
      "\n🔄 4. Testing manual reset (this will add lastReset field)..."
    );
    const resetResult = await SerialNumberGeneratorService.forceReset();
    console.log("Reset result:", JSON.stringify(resetResult, null, 2));

    // 5. Check status again to see if lastReset was added
    console.log("\n📊 5. Checking status after reset...");
    const afterStatus = await checkAllModelsStatus();
    console.log(
      "Models status after reset:",
      JSON.stringify(afterStatus, null, 2)
    );

    // 6. Test normal operation (should preserve lastReset)
    console.log(
      "\n📝 6. Testing normal operation (should preserve lastReset)..."
    );
    const nextSerial =
      await SerialNumberGeneratorService.getNextDecSerialNumber2();
    console.log(`Next serial generated: ${nextSerial}`);

    // 7. Final status check
    console.log(
      "\n📊 7. Final status check (lastReset should be preserved)..."
    );
    const finalStatus = await checkAllModelsStatus();
    console.log("Final models status:", JSON.stringify(finalStatus, null, 2));

    console.log("\n✅ ===== TEST COMPLETED =====\n");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Test reset timing logic specifically
async function testResetTimingLogic() {
  try {
    console.log("\n🕐 ===== TESTING RESET TIMING LOGIC =====\n");

    // Get current model
    const currentModel =
      await SerialNumberGeneratorService.getCurrentModelNumber();
    console.log(`Testing with current model: ${currentModel}`);

    // Test the reset check without actually resetting
    console.log("\n🔍 Testing reset check logic...");

    // This should show us the exact logic being used
    const needsReset =
      await SerialNumberGeneratorService.checkAndResetSerialNumber();
    console.log(`Reset needed: ${needsReset}`);

    console.log("\n✅ ===== TIMING TEST COMPLETED =====\n");
  } catch (error) {
    console.error("❌ Timing test failed:", error);
  }
}

// Test model switching
async function testModelSwitching() {
  try {
    console.log("\n🔄 ===== TESTING MODEL SWITCHING =====\n");

    // Check initial model
    const initialModel =
      await SerialNumberGeneratorService.getCurrentModelNumber();
    console.log(`Initial model: ${initialModel}`);

    // Force refresh (simulates model change)
    console.log("\n🔄 Testing force refresh (simulates model change)...");
    await SerialNumberGeneratorService.forceRefresh();

    // Check if model-specific data is loaded correctly
    const refreshedModel =
      await SerialNumberGeneratorService.getCurrentModelNumber();
    console.log(`Model after refresh: ${refreshedModel}`);

    console.log("\n✅ ===== MODEL SWITCHING TEST COMPLETED =====\n");
  } catch (error) {
    console.error("❌ Model switching test failed:", error);
  }
}

// Main test runner
async function runAllTests() {
  console.log("🚀 Starting comprehensive reset fix tests...\n");

  await testResetFix();
  await testResetTimingLogic();
  await testModelSwitching();

  console.log("🎉 All tests completed!");
  process.exit(0);
}

runAllTests().catch(console.error);
