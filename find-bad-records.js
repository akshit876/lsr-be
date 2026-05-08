import { MongoClient } from "mongodb";
const client = new MongoClient("mongodb://localhost:27017");
await client.connect();
const db = client.db("main-data");
const col = db.collection("records");

const byMarking = await col.find({
  MarkingData: { $in: ["B08E26A0001", "B08E26A0002"] }
}).toArray();
console.log("By MarkingData:", byMarking.length);
byMarking.forEach(r => console.log("  ", r.SerialNumber, r.MarkingData, r.Result, r.Timestamp, r._id));

const recent = await col.find({
  SerialNumber: { $in: ["0001", "0002"] }
}).sort({ Timestamp: -1 }).limit(10).toArray();
console.log("\nBy SerialNumber 0001/0002 (latest 10):", recent.length);
recent.forEach(r => console.log("  ", r.SerialNumber, r.MarkingData, r.Result, r.Timestamp, r._id));

const latest = await col.find({}).sort({ Timestamp: -1 }).limit(5).toArray();
console.log("\nLatest 5 records:");
latest.forEach(r => console.log("  ", r.SerialNumber, r.MarkingData, r.Timestamp));

await client.close();
