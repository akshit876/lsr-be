import { MongoClient } from "mongodb";
const client = new MongoClient("mongodb://localhost:27017");
await client.connect();
const db = client.db("main-data");

// Show current config
const config = await db.collection("config").findOne({});
console.log("Current model:", config?.currentModelConfig?.modelNumber);

// Show ALL modelSerialConfig entries
const allConfigs = await db.collection("modelSerialConfig").find({}).toArray();
console.log("\nAll modelSerialConfig entries:");
for (const c of allConfigs) {
  console.log(`  Model: ${c.modelNumber}`);
  console.log(`    currentValue: ${c.currentValue}`);
  console.log(`    startingSerial: ${c.startingSerial}`);
  console.log(`    lastReset: ${c.lastReset}`);
  console.log(`    lastUpdated: ${c.lastUpdated}`);
  console.log("");
}

// Show all records
const records = await db.collection("records").find({}).sort({ Timestamp: -1 }).toArray();
console.log(`Total records: ${records.length}`);
records.forEach(r => console.log(`  Serial=${r.SerialNumber}, Marking=${r.MarkingData}, Time=${r.Timestamp}`));

await client.close();
