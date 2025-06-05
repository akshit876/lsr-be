import { ScannerController } from "./services/scanCycles.js";
import { readBit } from "./services/index.js";

async function testConsolidatedReset() {
  console.log("🧪 Testing Consolidated Reset Detection...\n");

  const controller = new ScannerController();
  await controller.initialize();

  try {
    console.log("1. Checking current reset signal state:");
    const resetSignal = await readBit(1600, 0);
    console.log(`   Reset(1600.0): ${resetSignal}`);

    if (!resetSignal) {
      console.log(
        "❌ Reset signal is not active. Please activate reset signal (1600.0) and try again."
      );
      return;
    }

    console.log("\n2. Testing consolidated reset+bit detection:");
    console.log(
      "   This should detect reset immediately and throw exception..."
    );

    const startTime = Date.now();

    try {
      // This should throw RESET_DETECTED exception immediately
      const result = await controller.singleCheckAttempt(1410, 0, 1, 5000); // 5 second timeout

      const elapsed = Date.now() - startTime;
      console.log(`\n❌ FAILURE: No exception thrown after ${elapsed}ms`);
      console.log(`   Result: ${result}`);
      console.log("   Expected: RESET_DETECTED exception");
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.log(`\n3. Exception caught after ${elapsed}ms:`);
      console.log(`   Error: ${error.message}`);

      if (error.message === "RESET_DETECTED") {
        console.log(
          "✅ SUCCESS: Reset properly detected and exception thrown!"
        );
        console.log("   The consolidated approach is working correctly.");
      } else {
        console.log("❌ FAILURE: Wrong exception type");
        console.log(`   Expected: RESET_DETECTED`);
        console.log(`   Actual: ${error.message}`);
      }
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
  } finally {
    await controller.cleanup();
  }
}

testConsolidatedReset().catch(console.error);
