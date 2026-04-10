import "dotenv/config";
import { MongoClient } from "mongodb";
import logger from "../logger.js";
import { getTodayMidnightInTimezone, RESET_TIMEZONE } from "../services/serialNumber.js";

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db("main-data");
    const collection = db.collection("modelSerialConfig");

    const now = new Date();
    const midnight = getTodayMidnightInTimezone(now, RESET_TIMEZONE);

    const result = await collection.updateMany(
      { $or: [{ lastReset: { $exists: false } }, { lastReset: null }] },
      {
        $set: {
          lastReset: midnight,
          updatedAt: now,
        },
      }
    );

    logger.info(
      `✅ Backfill complete. matched=${result.matchedCount}, modified=${result.modifiedCount}, lastReset=${midnight.toISOString()} (timezone=${RESET_TIMEZONE})`
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

