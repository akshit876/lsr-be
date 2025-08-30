// Test file to debug pause mechanism and Socket.IO events
// This should show detailed logging of what's happening during pause

import { scannerController } from "./services/scanCycles.js";

console.log("🧪 Testing Pause Mechanism Debug");
console.log("=".repeat(50));

async function testPauseDebug() {
  try {
    // Initialize the scanner controller
    console.log("🔧 Initializing scanner controller...");
    await scannerController.initialize();

    console.log("✅ Scanner controller initialized");
    console.log("📊 Initial status:", scannerController.getStatus());

    // Test 1: Pause the cycle
    console.log("\n🧪 Test 1: Pausing cycle");
    scannerController.pauseCycle("Test pause - debug mode");
    console.log("📊 Status after pause:", scannerController.getStatus());

    // Test 2: Check if shouldPauseCycle is working
    console.log("\n🧪 Test 2: Testing shouldPauseCycle method");
    for (let i = 0; i < 5; i++) {
      const shouldPause = scannerController.shouldPauseCycle();
      console.log(`   Call ${i + 1}: shouldPauseCycle() = ${shouldPause}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Test 3: Resume the cycle
    console.log("\n🧪 Test 3: Resuming cycle");
    scannerController.resumeCycle();
    console.log("📊 Status after resume:", scannerController.getStatus());

    // Test 4: Check shouldPauseCycle again
    console.log("\n🧪 Test 4: Testing shouldPauseCycle after resume");
    for (let i = 0; i < 3; i++) {
      const shouldPause = scannerController.shouldPauseCycle();
      console.log(`   Call ${i + 1}: shouldPauseCycle() = ${shouldPause}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("\n✅ Pause debug test completed");
  } catch (error) {
    console.error("❌ Error during pause debug test:", error);
  }
}

// Run the test
testPauseDebug();
