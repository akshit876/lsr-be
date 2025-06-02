import {
  fixModelConfigurations,
  checkAllModelsStatus,
} from "./services/schedulerIntegration.js";
import logger from "./logger.js";

async function fixModelRecordFormat() {
  try {
    console.log("\n🔧 ===== FIXING MODEL RECORD FORMAT =====\n");

    // 1. Check current status
    console.log("📊 1. Checking current status of all models...");
    const beforeStatus = await checkAllModelsStatus();

    console.log("\n📋 BEFORE FIX:");
    beforeStatus.models.forEach((model) => {
      console.log(`Model ${model.modelNumber}:`);
      console.log(`  - currentValue: ${model.currentValue}`);
      console.log(
        `  - startingSerial: ${model.startingSerial} (expected: ${model.expectedStartingSerial}) ${model.startingSerialCorrect ? "✅" : "❌"}`
      );
      console.log(
        `  - hasLastReset: ${model.hasLastReset} ${model.hasLastReset ? "✅" : "⚠️"}`
      );
      console.log(`  - lastReset: ${model.lastReset || "Not set"}`);
      console.log(`  - lastUpdated: ${model.lastUpdated || "Not set"}`);
      console.log(
        `  - hasBeenUsed: ${model.hasBeenUsed} ${model.hasBeenUsed ? "✅" : "ℹ️"}`
      );
      console.log("");
    });

    // 2. Fix configurations
    console.log("🔧 2. Fixing model configurations...");
    await fixModelConfigurations();

    // 3. Check status after fix
    console.log("\n📊 3. Checking status after fix...");
    const afterStatus = await checkAllModelsStatus();

    console.log("\n📋 AFTER FIX:");
    afterStatus.models.forEach((model) => {
      console.log(`Model ${model.modelNumber}:`);
      console.log(`  - currentValue: ${model.currentValue}`);
      console.log(
        `  - startingSerial: ${model.startingSerial} (expected: ${model.expectedStartingSerial}) ${model.startingSerialCorrect ? "✅" : "❌"}`
      );
      console.log(
        `  - hasLastReset: ${model.hasLastReset} ${model.hasLastReset ? "✅" : "⚠️"}`
      );
      console.log(`  - lastReset: ${model.lastReset || "Not set"}`);
      console.log(`  - lastUpdated: ${model.lastUpdated || "Not set"}`);
      console.log(
        `  - hasBeenUsed: ${model.hasBeenUsed} ${model.hasBeenUsed ? "✅" : "ℹ️"}`
      );
      console.log("");
    });

    // 4. Summary
    console.log("📊 SUMMARY:");
    console.log(`Total models: ${afterStatus.totalModels}`);
    console.log(`With reset history: ${afterStatus.summary.withReset} ✅`);
    console.log(
      `Without reset history: ${afterStatus.summary.withoutReset} ⚠️`
    );
    console.log(
      `Correct starting serials: ${afterStatus.summary.correctStartingSerial} ✅`
    );
    console.log(
      `Incorrect starting serials: ${afterStatus.summary.incorrectStartingSerial} ❌`
    );

    console.log("\n✅ ===== FIX COMPLETED =====");
    console.log(
      "\n🔄 NOTE: Models without reset history will get lastReset field on their next reset."
    );
    console.log(
      "📝 NOTE: Both lastUpdated and updatedAt fields should now be properly managed."
    );
  } catch (error) {
    console.error("❌ Fix failed:", error);
  }
}

// Expected record format after fix:
console.log("\n📋 ===== EXPECTED RECORD FORMAT =====");
console.log(`
CMB-877 should look like:
{
  "modelNumber": "CMB-877",
  "currentValue": "326",
  "lastUpdated": "2025-06-02T19:29:54.399Z",  // ← Latest activity
  "startingSerial": 7001,                     // ← Correct for CMB-877
  "updatedAt": "2025-06-02T19:29:54.399Z",    // ← Should match lastUpdated
  // "lastReset": will be added on first reset after 6:00 AM
}

CMB-778 should look like:
{
  "modelNumber": "CMB-778", 
  "currentValue": "12",
  "lastUpdated": "2025-06-02T07:44:18.317Z",  // ← Latest activity
  "startingSerial": 1,                        // ← Correct for CMB-778
  "lastReset": "2025-06-02T04:02:47.430Z",    // ← When it last reset
  "updatedAt": "2025-06-02T07:44:18.317Z"     // ← Should match lastUpdated
}
`);

console.log("\n🚀 Starting model record format fix...\n");
fixModelRecordFormat()
  .then(() => {
    console.log("\n🎉 Process completed!");
    process.exit(0);
  })
  .catch(console.error);
