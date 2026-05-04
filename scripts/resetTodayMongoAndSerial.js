/**
 * Deletes all `main-data.records` whose Timestamp falls on the local calendar
 * "today", then seeds the serial counter so the next issued serial is
 * `--first-serial` (default 250) by inserting an anchor row with serial
 * (first-serial - 1) and updating `serialNoconfig` (same name the app uses).
 *
 * Usage:
 *   node scripts/resetTodayMongoAndSerial.js
 *   node scripts/resetTodayMongoAndSerial.js --dry-run
 *   node scripts/resetTodayMongoAndSerial.js --first-serial 300
 *
 * Env: MONGODB_URL (default from config / .env)
 */
import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const DEFAULT_MONGO =
  process.env.MONGODB_URL || "mongodb://localhost:27017";

const DB_NAME = "main-data";
const RECORDS = "records";
/** Primary: services/serialNumber.js. Fallback: scripts/initializeDB.js uses serialNoConfig. */
const SERIAL_CONFIG_COLLECTIONS = ["serialNoconfig", "serialNoConfig"];

function parseArgs(argv) {
  let dryRun = false;
  let firstSerial = 250;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--first-serial" && argv[i + 1]) {
      firstSerial = parseInt(argv[++i], 10);
      if (!Number.isFinite(firstSerial) || firstSerial < 1) {
        throw new Error("--first-serial must be a positive integer");
      }
    }
  }
  return { dryRun, firstSerial };
}

function localDayBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start, end };
}

async function main() {
  const { dryRun, firstSerial } = parseArgs(process.argv);
  const anchorSerial = firstSerial - 1;
  if (anchorSerial < 0) {
    throw new Error("first-serial must be at least 1");
  }

  const { start, end } = localDayBounds();
  console.log(
    `[resetToday] Local date window: ${start.toISOString()} .. ${end.toISOString()}`
  );
  console.log(
    `[resetToday] Will delete records in that window; next issued serial → ${firstSerial} (anchor SerialNumber=${anchorSerial})`
  );
  if (dryRun) console.log("[resetToday] DRY RUN — no writes");

  const client = await MongoClient.connect(DEFAULT_MONGO);
  try {
    const db = client.db(DB_NAME);
    const coll = db.collection(RECORDS);
    const filter = { Timestamp: { $gte: start, $lte: end } };
    const toDelete = await coll.countDocuments(filter);
    console.log(`[resetToday] Matching records to delete: ${toDelete}`);

    if (!dryRun) {
      const del = await coll.deleteMany(filter);
      console.log(`[resetToday] Deleted: ${del.deletedCount}`);

      const anchor = {
        Timestamp: new Date(),
        SerialNumber: String(anchorSerial),
        // Must match real scan rows: MarkingData is a string (barcode text) or "" — never {}
        // or the frontend can throw when it treats this field as text.
        MarkingData: "",
        ScannerData: "__script_reset_today__",
        ModelNumber: "__system__",
        Result: "N/A",
        User: "script/resetTodayMongoAndSerial.js",
        Grade: "N/A",
        CurrentId: null,
      };
      const ins = await coll.insertOne(anchor);
      console.log(`[resetToday] Inserted anchor _id=${ins.insertedId}`);

      const cfgPayload = {
        $set: {
          currentValue: String(firstSerial),
          updatedAt: new Date().toISOString(),
          updatedBy: "resetTodayMongoAndSerial.js",
        },
      };
      const primary = SERIAL_CONFIG_COLLECTIONS[0];
      for (const name of SERIAL_CONFIG_COLLECTIONS) {
        const serialCol = db.collection(name);
        const hasDocs = (await serialCol.countDocuments()) > 0;
        const upsert = name === primary || hasDocs;
        if (!upsert) {
          console.log(`[resetToday] ${name} skipped (empty; app uses ${primary})`);
          continue;
        }
        const cfgRes = await serialCol.updateOne({}, cfgPayload, { upsert: true });
        console.log(
          `[resetToday] ${name} upsert matched=${cfgRes.matchedCount} modified=${cfgRes.modifiedCount} upserted=${cfgRes.upsertedCount}`
        );
      }
    }
  } finally {
    await client.close();
  }
  console.log("[resetToday] Done. Restart the app so SerialNumberGeneratorService re-reads MongoDB.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
