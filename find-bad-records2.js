import { MongoClient } from "mongodb";
const client = new MongoClient("mongodb://localhost:27017");
await client.connect();

// List all databases
const adminDb = client.db().admin();
const dbs = await adminDb.listDatabases();
console.log("Databases:");
for (const d of dbs.databases) {
  console.log("  ", d.name);
  const db = client.db(d.name);
  const cols = await db.listCollections().toArray();
  for (const c of cols) {
    const count = await db.collection(c.name).countDocuments({});
    console.log("    ", c.name, `(${count} docs)`);

    // Search for B08E26A in any collection with reasonable doc count
    if (count > 0 && count < 100000) {
      const match = await db.collection(c.name).findOne({
        $or: [
          { MarkingData: { $regex: "B08E26A" } },
          { markingData: { $regex: "B08E26A" } },
        ]
      });
      if (match) {
        console.log("      *** FOUND B08E26A data here! ***");
        console.log("      Sample:", JSON.stringify(match).substring(0, 200));
      }
    }
  }
}

await client.close();
