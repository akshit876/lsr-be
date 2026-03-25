/**
 * Creates indexes on main-data.records to reduce COLLSCANs (memory/CPU pressure).
 * Run once after deploy: npm run create-indexes
 */
import { MongoClient } from "mongodb";
import config from "../config/config.js";

async function main() {
  const client = await MongoClient.connect(
    config.mongodb.url,
    config.mongodb.clientOptions
  );
  try {
    const col = client.db(config.mongodb.database).collection(config.mongodb.collection);

    const results = await Promise.all([
      col.createIndex({ Timestamp: 1 }, { name: "idx_Timestamp" }),
      col.createIndex(
        { SerialNumber: 1, Timestamp: -1 },
        { name: "idx_SerialNumber_Timestamp" }
      ),
      col.createIndex({ Shift: 1, Timestamp: 1 }, { name: "idx_Shift_Timestamp" }),
    ]);

    console.log("Indexes ensured:", results);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
