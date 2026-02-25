/**
 * Manually insert one record into modelSerialConfig (e.g. after wiping DB).
 * Next serial for this model will be (currentValue + 1). Default 220 → next 0221 so it doesn't reset today.
 *
 * Usage:
 *   node scripts/insert-modelSerialConfig.js
 *   MODEL_NUMBER=FLYWHEEL-K10 node scripts/insert-modelSerialConfig.js
 *   MODEL_NUMBER=CMB-778 CURRENT_VALUE=0 node scripts/insert-modelSerialConfig.js
 *
 * Env:
 *   MODEL_NUMBER  - model to create (default: FLYWHEEL-K10)
 *   CURRENT_VALUE - last used serial number; next will be this + 1 (default: 220 → next 0221, no reset today)
 */

import MongoDBService from "../services/mongoDbService.js";

const MODEL_NUMBER = process.env.MODEL_NUMBER || "FLYWHEEL-K10";
const CURRENT_VALUE = process.env.CURRENT_VALUE != null
  ? String(process.env.CURRENT_VALUE)
  : "220";

// startingSerial: 701 for CMB-877, else 1
const STARTING_SERIAL = MODEL_NUMBER === "CMB-877" ? 701 : 1;

async function run() {
  try {
    await MongoDBService.connect("main-data", "modelSerialConfig");

    const now = new Date();
    const doc = {
      modelNumber: MODEL_NUMBER,
      currentValue: CURRENT_VALUE,
      startingSerial: STARTING_SERIAL,
      lastUpdated: now,
      updatedAt: now,
      lastReset: now, // so we don't reset again immediately
    };

    const existing = await MongoDBService.collection.findOne({
      modelNumber: MODEL_NUMBER,
    });
    if (existing) {
      console.log(`⚠️ Document already exists for model "${MODEL_NUMBER}". Use update or delete first.`);
      console.log("Existing:", JSON.stringify(existing, null, 2));
      await MongoDBService.disconnect();
      process.exit(1);
    }

    await MongoDBService.collection.insertOne(doc);
    console.log("✅ Inserted into modelSerialConfig:");
    console.log(JSON.stringify(doc, null, 2));
    console.log(`\nNext serial for ${MODEL_NUMBER} will be: ${String(parseInt(CURRENT_VALUE, 10) + 1).padStart(4, "0")}`);

    await MongoDBService.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

run();
