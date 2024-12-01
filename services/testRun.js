// import BufferedComPortService from "./ComPortService.js";
import { MongoClient } from "mongodb";
import { readBit, writeBitsWithRest } from "./modbus.js";
import logger from "../logger.js";
// import { sleep } from "./testCycle.js";

// const comService = new BufferedComPortService({
//   path: "COM5",
//   baudRate: 9600,
//   logDir: "com_port_logs",
// });
export async function fetchGradeConfig() {
  try {
    // Connect to the MongoDB if not already connected
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db("main-data");
    logger.info("Connected successfully to MongoDB database: main-data");

    // Fetch grading configuration from the 'gradeConfig' collection
    const gradeConfigCollection = db.collection("gradeConfig");
    const gradeConfigData = await gradeConfigCollection.find({}).toArray();

    logger.info("Fetched grade configuration data successfully");

    return gradeConfigData; // Return the grade configuration data
  } catch (error) {
    logger.error("Error fetching grade configuration data:", error);
    throw error;
  }
}

async function checkGrading(scannerResult) {
  // Get the last character from the scanner result and convert it to uppercase
  const lastChar = scannerResult.slice(-1).toUpperCase();

  // Retrieve grading configuration from MongoDB (using a mock fetch function here)
  const gradeData = await fetchGradeConfig()?.[0]; // Assume this fetches the data in the format provided

  if (!gradeData) {
    console.error("Grading data is not valid or could not be retrieved.");
    return false;
  }

  // Find the grade entry in MongoDB that matches the last character
  const gradeEntry = gradeData.r.find((item) => item.grade === lastChar);

  if (!gradeEntry) {
    console.error(
      `No grading rule found in MongoDB for character: ${lastChar}`
    );
    return false;
  }

  // Define acceptable grades based on the MongoDB grade
  const acceptableGradesMapping = {
    A: ["A"],
    B: ["A", "B"],
    C: ["A", "B", "C"],
    D: ["A", "B", "C", "D"],
    // Add more grades as needed
  };

  // Check if the last character is valid according to the MongoDB config
  const allowedGrades = acceptableGradesMapping[gradeEntry.grade];
  if (!allowedGrades) {
    console.error(
      `No acceptable grades defined for MongoDB grade: ${gradeEntry.grade}`
    );
    return false;
  }

  // Validate the user input grade (lastChar) against the allowed grades
  const isValid = allowedGrades.includes(lastChar);

  if (!isValid) {
    console.error(
      `Grade "${lastChar}" is not acceptable for MongoDB grade: "${gradeEntry.grade}"`
    );
  }

  return isValid;
}

async function runn() {
  try {
    // const r = await fetchGradeConfig();
    // console.log({ r });
    const d = await readBit(1400, 0);
    console.log({ d });
    // console.log("Attempting to initialize serial port...");
    // await comService.initSerialPort();
    // console.log("Initialized serial port successfully");

    // while (true) {
    //   try {
    // await writeBitsWithRest(1417, 0, 1, 100, false);
    // Wait for the next data event before proceeding
    //     const scannerData = await new Promise((resolve) => {
    //       comService.once("data", resolve);
    //     });

    //     console.log("=== STARTING NEW SCAN CYCLE ===");
    //     console.log(
    //       "-----------------------------------------------------------------------------------------------------------"
    //     );
    //     console.log(`Received scanner data: ${scannerData}`);

    //     // Process the scanner data after receiving it

    //     // Optional delay before the next cycle, if needed
    //     await sleep(5 * 1000);
    //   } catch (error) {
    //     console.error("Error processing data:", error);
    //   }
    // }
  } catch (comError) {
    console.log("Failed to initialize serial port:", comError);
    console.log("Retrying in 5 seconds...");
    // await sleep(5000);
  }
}

// runn();
