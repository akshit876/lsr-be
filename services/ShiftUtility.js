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
  await mongoDbService.connect("main-data", "config");
  const collection = mongoDbService.collection;
  const config = await collection.findOne({});
  console.log({ config });
  
  // Check for new format: shifts array
  if (config && config.shifts && Array.isArray(config.shifts)) {
    // Transform the shifts array format to the expected format
    const transformedConfig = {};
    config.shifts.forEach((shift) => {
      transformedConfig[shift.name] = {
        start: shift.startTime,
        end: shift.endTime,
      };
    });
    console.log("Transformed shift config from MongoDB:", transformedConfig);
    return transformedConfig;
  }
  
  // Fallback to old format: shiftConfig object
  return config ? config.shiftConfig : null;
}

export async function updateShiftConfigInDB(newConfig) {
  await mongoDbService.connect("main-data", "config");
  const collection = mongoDbService.collection;
  await collection.updateOne(
    {}, // Update the first document found
    { $set: { shiftConfig: newConfig } }, // Set the new configuration
    { upsert: true } // Create a new document if none exists
  );
}
class ShiftUtility {
  constructor(shiftConfig = null) {
    // Initialize shiftConfig - can be passed directly or will use defaults
    // Default configuration (fallback if MongoDB config not available):
    // Shift A: 00:00 to 08:30 (midnight to 8:30 AM)
    // Shift B: 08:30 to 17:30 (8:30 AM to 5:30 PM)
    // Shift C: 17:30 to 00:00 (5:30 PM to midnight)
    this.shiftConfig = shiftConfig || {
      A: { start: "00:00", end: "08:30" },
      B: { start: "08:30", end: "17:30" },
      C: { start: "17:30", end: "00:00" },
    };
  }

  // Method to initialize shift config from MongoDB
  async initializeFromDB() {
    try {
      const dbConfig = await getShiftConfigFromDB();
      if (dbConfig) {
        this.shiftConfig = dbConfig;
        console.log("Shift configuration loaded from MongoDB:", this.shiftConfig);
        return true;
      } else {
        console.log("No shift configuration found in MongoDB, using defaults");
        return false;
      }
    } catch (error) {
      console.error("Error loading shift config from MongoDB:", error);
      console.log("Using default shift configuration");
      return false;
    }
  }

  setShiftConfig(newConfig) {
    this.shiftConfig = { ...this.shiftConfig, ...newConfig };
  }

  getCurrentShift(currentTime = new Date()) {
    const shifts = Object.entries(this.shiftConfig);
    
    for (let i = 0; i < shifts.length; i++) {
      const [shift, times] = shifts[i];
      const start = this._parseTime(times.start, currentTime);
      let end = this._parseTime(times.end, currentTime);
      let adjustedCurrentTime = currentTime;

      // Handle overnight shifts
      const isOvernight = isBefore(end, start);
      if (isOvernight) {
        end = addDays(end, 1);
        if (isBefore(currentTime, start)) {
          adjustedCurrentTime = addDays(currentTime, 1);
        }
      }

      // For regular (non-overnight) shifts: 
      // - Start time is inclusive (shift starts at this time)
      // - End time is inclusive (shift includes this time, next shift starts after)
      // For overnight shifts:
      // - Start time is inclusive
      // - End time is exclusive (shift ends before this time next day)
      
      if (isOvernight) {
        // Overnight shift: start inclusive, end exclusive
        if (
          (isAfter(adjustedCurrentTime, start) ||
            adjustedCurrentTime.getTime() === start.getTime()) &&
          isBefore(adjustedCurrentTime, end)
        ) {
          return shift;
        }
      } else {
        // Regular shift: both start and end are inclusive
        // Time matches if: time >= start AND time <= end
        if (
          (isAfter(adjustedCurrentTime, start) ||
            adjustedCurrentTime.getTime() === start.getTime()) &&
          (isBefore(adjustedCurrentTime, end) ||
            adjustedCurrentTime.getTime() === end.getTime())
        ) {
          return shift;
        }
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

// // Run the example
// run().catch((error) => {
//   console.error("Error running the shift utility:", error);
// });
