// Test file to verify pause/resume mechanism fix
// This should show that cycles properly stop when paused and restart when resumed

import { scannerController } from "./services/scanCycles.js";

console.log("🧪 Testing Pause/Resume Mechanism Fix");
console.log("=".repeat(50));

async function testPauseResumeFix() {
  try {
    // Initialize the scanner controller
    console.log("🔧 Initializing scanner controller...");
    await scannerController.initialize();

    console.log("✅ Scanner controller initialized");
    console.log("📊 Initial status:", scannerController.getStatus());

    // Test 1: Pause the cycle
    console.log("\n🧪 Test 1: Pausing cycle");
    scannerController.pauseCycle("Test pause - should stop cycle completely");
    console.log("📊 Status after pause:", scannerController.getStatus());

    // Test 2: Check if cycle is properly paused
    console.log("\n🧪 Test 2: Verifying pause state");
    const isPaused = scannerController.shouldPauseCycle();
    console.log(`   shouldPauseCycle() = ${isPaused}`);
    console.log(`   isCyclePaused = ${scannerController.isCyclePaused}`);

    // Test 3: Resume the cycle
    console.log("\n🧪 Test 3: Resuming cycle");
    scannerController.resumeCycle();
    console.log("📊 Status after resume:", scannerController.getStatus());

    // Test 4: Check if cycle is properly resumed
    console.log("\n🧪 Test 4: Verifying resume state");
    const isPausedAfterResume = scannerController.shouldPauseCycle();
    console.log(`   shouldPauseCycle() = ${isPausedAfterResume}`);
    console.log(`   isCyclePaused = ${scannerController.isCyclePaused}`);

    console.log("\n✅ Pause/Resume mechanism test completed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testPauseResumeFix();
