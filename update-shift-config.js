import mongoDbService from "./services/mongoDbService.js";

async function updateShiftConfig() {
  try {
    await mongoDbService.connect("main-data", "config");
    const collection = mongoDbService.collection;

    // New shift configuration
    const newShiftConfig = {
      A: { start: "00:00", end: "08:30" },
      B: { start: "08:30", end: "17:00" },
      C: { start: "17:00", end: "00:00" },
    };

    // Update the shift configuration in the database
    await collection.updateOne(
      {}, // Update the first document found
      { $set: { shiftConfig: newShiftConfig } },
      { upsert: true } // Create a new document if none exists
    );

    console.log("Shift configuration updated successfully:");
    console.log(JSON.stringify(newShiftConfig, null, 2));

    await mongoDbService.close();
  } catch (error) {
    console.error("Error updating shift configuration:", error);
  }
}

updateShiftConfig();
