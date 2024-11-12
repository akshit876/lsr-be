/* eslint-disable consistent-return */
const { Low } = require("lowdb");
const { JSONFilePreset } = require("lowdb/node");
const path = require("path");
const { fileURLToPath } = require("url");

const __filename = fileURLToPath(__filename);
const __dirname = path.dirname(__filename);

// Define the path to the database file
const filePath = path.join(__dirname, "../data", "db.json");
console.log({ filePath });

// Set up the adapter and LowDB instance
// const adapter = new JSONFile(filePath);
// const db = new Low(adapter);

const db = await JSONFilePreset(filePath, { data: {} });

console.log({ db });

async function initDb() {
  try {
    await db.read();
    // Initialize with a default structure if db.data is not present
    db.data ||= { data: {} };
    await db.write();
  } catch (error) {
    console.error("Error reading or writing database:", error);
    // Optionally throw the error to stop execution or handle differently
    throw error;
  }
}

async function setData(key, value) {
  try {
    await initDb();
    db.data.data[key] = value;
    await db.write();
  } catch (error) {
    console.error("Error writing to database:", error);
  }
}

async function deleteData(key) {
  try {
    await initDb();
    if (key in db.data.data) {
      delete db.data.data[key];
      await db.write();
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error writing to database:", error);
  }
}

async function getData(key) {
  await initDb();
  return db.data.data[key] || null;
}

async function getAllData() {
  await initDb();
  return db.data.data;
}

// Export functions using CommonJS syntax
module.exports = { setData, getData, deleteData, getAllData };

// For testing purposes
// try {
//   await initDb(); // Ensure DB is initialized before testing
//   await setData("abc", 190);
//   console.log("Data set successfully");
//   const vendorCode = await getData("codeData");
//   console.log({ vendorCode: vendorCode?.vendor_code });
// } catch (error) {
//   console.error("Error setting data:", error);
// }
