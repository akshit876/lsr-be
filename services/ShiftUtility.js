import { parse, isAfter, isBefore, addDays, format, set } from "date-fns";
import mongoDbService from "./mongoDbService.js";

export function transformMongoObject(shiftConfig) {
  // Create an array of shifts
  const shifts = Object.keys(shiftConfig);
  const transformedConfig = {};

  // Loop through each shift to set start and end times
  for (let i = 0; i < shifts.length; i++) {
    const currentShift = shifts[i];
    const nextShift = shifts[(i + 1) % shifts.length]; // Wrap around to the first shift

    transformedConfig[currentShift] = {
      start: shiftConfig[currentShift],
      end: shiftConfig[nextShift], // Set end time to the start time of the next shift
    };
  }
  console.log({ transformedConfig });

  return transformedConfig;
}

export async function getShiftConfigFromDB() {
  await mongoDbService.connect("main-data", "configs");
  const collection = mongoDbService.collection;
  const config = await collection.findOne({});
  console.log({ config });
  return config ? config.shiftConfig : null; // Assuming the document structure has a field 'shiftConfig'
}

export async function updateShiftConfigInDB(newConfig) {
  await mongoDbService.connect("main-data", "configs");
  const collection = mongoDbService.collection;
  await collection.updateOne(
    {}, // Update the first document found
    { $set: { shiftConfig: newConfig } }, // Set the new configuration
    { upsert: true } // Create a new document if none exists
  );
}
class ShiftUtility {
  constructor(shiftConfig = null) {
    // Initialize shiftConfig from MongoDB
    this.shiftConfig = shiftConfig || {
      A: { start: "06:00", end: "14:30" },
      B: { start: "14:30", end: "23:00" },
      C: { start: "23:00", end: "06:00" },
    };
  }

  setShiftConfig(newConfig) {
    this.shiftConfig = { ...this.shiftConfig, ...newConfig };
  }

  getCurrentShift(currentTime = new Date()) {
    for (const [shift, times] of Object.entries(this.shiftConfig)) {
      const start = this._parseTime(times.start, currentTime);
      let end = this._parseTime(times.end, currentTime);

      // Handle overnight shifts
      if (isBefore(end, start)) {
        end = addDays(end, 1);
        if (isBefore(currentTime, start)) {
          currentTime = addDays(currentTime, 1);
        }
      }

      if (
        (isAfter(currentTime, start) ||
          currentTime.getTime() === start.getTime()) &&
        isBefore(currentTime, end)
      ) {
        return shift;
      }
    }

    // If no shift is found (shouldn't happen with 24-hour coverage)
    return "Unknown";
  }

  getNextShift(currentShift) {
    const shifts = Object.keys(this.shiftConfig);
    const currentIndex = shifts.indexOf(currentShift);
    return shifts[(currentIndex + 1) % shifts.length];
  }

  getShiftStartTime(shift) {
    return this.shiftConfig[shift].start;
  }

  getShiftEndTime(shift) {
    return this.shiftConfig[shift].end;
  }

  _parseTime(timeString, baseDate) {
    const [hours, minutes] = timeString.split(":").map(Number);
    return set(baseDate, { hours, minutes, seconds: 0, milliseconds: 0 });
  }

  // New method to update shift config in MongoDB
  async updateShiftConfig(newConfig) {
    this.shiftConfig = { ...this.shiftConfig, ...newConfig };
    await updateShiftConfigInDB(this.shiftConfig); // Function to update MongoDB
  }
}

// Usage example
// const shiftUtil = new ShiftUtility();

// console.log(shiftUtil.getCurrentShift()); // Returns current shift based on system time

// // Example of changing shift timings
// shiftUtil.setShiftConfig({
//     A: { start: "07:00", end: "15:30" },
//     B: { start: "15:30", end: "23:30" },
//     C: { start: "23:30", end: "07:00" },
// });

// console.log(shiftUtil.getCurrentShift(new Date("2023-05-01T16:00:00"))); // Should return 'B'
// console.log(shiftUtil.getNextShift("B")); // Should return 'C'
// console.log(shiftUtil.getShiftStartTime("A")); // Should return '07:00'

export default ShiftUtility;

async function run() {
  // Create an instance of ShiftUtility
  const shiftUtil = await getShiftConfigFromDB();
  console.log({ shiftUtil });

  // Usage example
  const newConfig = transformMongoObject(shiftUtil);
  console.log({ newConfig });

  // // Fetch the current shift based on the system time
  // const currentShift = shiftUtil.getCurrentShift();
  // console.log(`Current Shift: ${currentShift}`);

  // // Example of changing shift timings
  // const newShiftConfig = {
  //   A: { start: "07:00", end: "15:30" },
  //   B: { start: "15:30", end: "23:30" },
  //   C: { start: "23:30", end: "07:00" },
  // };

  // // Update the shift configuration
  // await shiftUtil.updateShiftConfig(newShiftConfig);
  // console.log("Shift configuration updated.");

  // // Fetch the updated current shift
  // const updatedCurrentShift = shiftUtil.getCurrentShift();
  // console.log(`Updated Current Shift: ${updatedCurrentShift}`);

  // // Get the next shift
  // const nextShift = shiftUtil.getNextShift(updatedCurrentShift);
  // console.log(`Next Shift: ${nextShift}`);

  // // Get start and end times for a specific shift
  // const shiftAStartTime = shiftUtil.getShiftStartTime("A");
  // const shiftAEndTime = shiftUtil.getShiftEndTime("A");
  // console.log(`Shift A Start Time: ${shiftAStartTime}`);
  // console.log(`Shift A End Time: ${shiftAEndTime}`);
}

// Run the example
run().catch((error) => {
  console.error("Error running the shift utility:", error);
});
