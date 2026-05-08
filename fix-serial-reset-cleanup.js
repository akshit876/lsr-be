/**
 * One-time fix: Remove the two bad records (serial 0001, 0002) created by the
 * serial-reset bug on May 8, and set modelSerialConfig so next serial is 0250.
 *
 * Run this on the PRODUCTION machine:
 *   node fix-serial-reset-cleanup.js
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB = "main-data";

async function run() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB);

  // 1. Find current model
  const configCol = db.collection("config");
  const config = await configCol.findOne({});
  const modelNumber = config?.currentModelConfig?.modelNumber ?? "unknown";
  console.log(`Current model: ${modelNumber}\n`);

  // 2. Find and delete the two bad records (serial 0001, 0002)
  //    Search by marking data pattern from screenshot AND by serial number
  const recordsCol = db.collection("records");

  const badRecords = await recordsCol
    .find({
      $or: [
        { MarkingData: { $in: ["B08E26A0001", "B08E26A0002"] } },
        { MarkingData: { $regex: "B08E26A000[12]" } },
        {
          SerialNumber: { $in: ["0001", "0002"] },
          Timestamp: { $gte: new Date("2026-05-08T00:00:00") },
        },
      ],
    })
    .toArray();

  console.log(`Found ${badRecords.length} bad records to delete:`);
  for (const rec of badRecords) {
    console.log(
      `  ID=${rec._id}, Serial=${rec.SerialNumber}, Marking=${rec.MarkingData}, ` +
      `Result=${rec.Result}, Time=${rec.Timestamp}`
    );
  }

  if (badRecords.length > 0) {
    const ids = badRecords.map((r) => r._id);
    const deleteResult = await recordsCol.deleteMany({ _id: { $in: ids } });
    console.log(`Deleted ${deleteResult.deletedCount} bad record(s).\n`);
  } else {
    console.log("No bad records found.\n");
  }

  // 3. Set modelSerialConfig so next serial = 0250 (currentValue = "249")
  const serialCol = db.collection("modelSerialConfig");

  const before = await serialCol.findOne({ modelNumber });
  console.log(`Before fix - modelSerialConfig for "${modelNumber}":`);
  if (before) {
    console.log(`  currentValue: ${before.currentValue}`);
    console.log(`  startingSerial: ${before.startingSerial}`);
    console.log(`  lastReset: ${before.lastReset}`);
    console.log(`  lastUpdated: ${before.lastUpdated}`);
  } else {
    console.log("  (no entry exists yet)");
  }

  const now = new Date();
  await serialCol.updateOne(
    { modelNumber },
    {
      $set: {
        modelNumber,
        currentValue: "249",
        startingSerial: 1,
        lastUpdated: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  const after = await serialCol.findOne({ modelNumber });
  console.log(`\nAfter fix - modelSerialConfig for "${modelNumber}":`);
  console.log(`  currentValue: ${after.currentValue}  --> next serial will be 0250`);
  console.log(`  startingSerial: ${after.startingSerial}`);
  console.log(`  lastReset: ${after.lastReset}`);
  console.log(`  lastUpdated: ${after.lastUpdated}`);

  // 4. Update local cache file
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const cachePath = path.join(process.cwd(), ".serial-cache.json");
    let cache = { models: {} };
    try {
      cache = JSON.parse(await fs.readFile(cachePath, "utf8"));
    } catch (_) {}
    cache.models[modelNumber] = {
      ...(cache.models[modelNumber] || {}),
      currentValue: "249",
      startingSerial: 1,
      lastUpdated: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
    console.log("\nLocal cache updated.");
  } catch (e) {
    console.log("\nCould not update local cache:", e.message);
  }

  console.log("\nDone! Next serial number will be 0250.");
  await client.close();
}

run().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
