import SerialNumberGeneratorService from "./services/serialNumber.js";
import MongoDBService from "./services/mongoDbService.js";
import logger from "./logger.js";

async function testTimestampUpdate() {
  try {
    console.log("\n🔍 ===== TESTING TIMESTAMP UPDATE =====\n");

    // Initialize the serial number service
    await SerialNumberGeneratorService.initialize("main-data", "records");

    console.log("1. 📊 Current status before test:");
    await MongoDBService.connect("main-data", "modelSerialConfig");
    const beforeUpdate = await MongoDBService.collection.findOne({
      modelNumber: "CMB-877",
    });

    if (beforeUpdate) {
      console.log(`   Model: ${beforeUpdate.modelNumber}`);
      console.log(`   currentValue: ${beforeUpdate.currentValue}`);
      console.log(
        `   lastUpdated: ${beforeUpdate.lastUpdated ? new Date(beforeUpdate.lastUpdated).toISOString() : "null"}`
      );
      console.log(
        `   updatedAt: ${beforeUpdate.updatedAt ? new Date(beforeUpdate.updatedAt).toISOString() : "null"}`
      );
      console.log(
        `   lastReset: ${beforeUpdate.lastReset ? new Date(beforeUpdate.lastReset).toISOString() : "null"}`
      );
    } else {
      console.log("   No CMB-877 record found");
      return;
    }

    console.log("\n2. 🎯 Calling getNextDecSerialNumber2()...");
    const startTime = new Date();
    console.log(`   Test started at: ${startTime.toISOString()}`);

    const serialNumber =
      await SerialNumberGeneratorService.getNextDecSerialNumber2();

    const endTime = new Date();
    console.log(`   Serial returned: ${serialNumber}`);
    console.log(`   Test completed at: ${endTime.toISOString()}`);

    console.log("\n3. 📊 Current status after test:");
    const afterUpdate = await MongoDBService.collection.findOne({
      modelNumber: "CMB-877",
    });

    if (afterUpdate) {
      console.log(`   Model: ${afterUpdate.modelNumber}`);
      console.log(
        `   currentValue: ${afterUpdate.currentValue} (was: ${beforeUpdate.currentValue})`
      );
      console.log(
        `   lastUpdated: ${afterUpdate.lastUpdated ? new Date(afterUpdate.lastUpdated).toISOString() : "null"}`
      );
      console.log(
        `   updatedAt: ${afterUpdate.updatedAt ? new Date(afterUpdate.updatedAt).toISOString() : "null"}`
      );
      console.log(
        `   lastReset: ${afterUpdate.lastReset ? new Date(afterUpdate.lastReset).toISOString() : "null"}`
      );
    }

    console.log("\n4. 🔍 Comparison:");
    console.log(
      `   currentValue changed: ${beforeUpdate.currentValue} → ${afterUpdate.currentValue}`
    );

    const beforeLastUpdated = beforeUpdate.lastUpdated
      ? new Date(beforeUpdate.lastUpdated)
      : null;
    const afterLastUpdated = afterUpdate.lastUpdated
      ? new Date(afterUpdate.lastUpdated)
      : null;
    const beforeUpdatedAt = beforeUpdate.updatedAt
      ? new Date(beforeUpdate.updatedAt)
      : null;
    const afterUpdatedAt = afterUpdate.updatedAt
      ? new Date(afterUpdate.updatedAt)
      : null;

    if (beforeLastUpdated && afterLastUpdated) {
      const timeDiff = afterLastUpdated.getTime() - beforeLastUpdated.getTime();
      console.log(
        `   lastUpdated changed: ${timeDiff > 0 ? "✅ YES" : "❌ NO"} (${timeDiff}ms difference)`
      );
    } else {
      console.log(
        `   lastUpdated: ${beforeLastUpdated ? "had value" : "was null"} → ${afterLastUpdated ? "has value" : "still null"}`
      );
    }

    if (beforeUpdatedAt && afterUpdatedAt) {
      const timeDiff = afterUpdatedAt.getTime() - beforeUpdatedAt.getTime();
      console.log(
        `   updatedAt changed: ${timeDiff > 0 ? "✅ YES" : "❌ NO"} (${timeDiff}ms difference)`
      );
    } else {
      console.log(
        `   updatedAt: ${beforeUpdatedAt ? "had value" : "was null"} → ${afterUpdatedAt ? "has value" : "still null"}`
      );
    }

    console.log("\n5. 📅 Timestamp Analysis:");
    if (afterLastUpdated) {
      const testStartDiff = Math.abs(
        afterLastUpdated.getTime() - startTime.getTime()
      );
      const testEndDiff = Math.abs(
        afterLastUpdated.getTime() - endTime.getTime()
      );
      console.log(`   lastUpdated vs test start: ${testStartDiff}ms`);
      console.log(`   lastUpdated vs test end: ${testEndDiff}ms`);
      console.log(
        `   lastUpdated is recent: ${testStartDiff < 5000 ? "✅ YES" : "❌ NO (older than 5 seconds)"}`
      );
    }

    if (afterUpdatedAt) {
      const testStartDiff = Math.abs(
        afterUpdatedAt.getTime() - startTime.getTime()
      );
      const testEndDiff = Math.abs(
        afterUpdatedAt.getTime() - endTime.getTime()
      );
      console.log(`   updatedAt vs test start: ${testStartDiff}ms`);
      console.log(`   updatedAt vs test end: ${testEndDiff}ms`);
      console.log(
        `   updatedAt is recent: ${testStartDiff < 5000 ? "✅ YES" : "❌ NO (older than 5 seconds)"}`
      );
    }

    console.log("\n✅ ===== TEST COMPLETED =====");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await MongoDBService.disconnect();
  }
}

console.log("\n🚀 Starting timestamp update test...\n");
testTimestampUpdate()
  .then(() => {
    console.log("\n🎉 Test finished!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Test failed:", error);
    process.exit(1);
  });
