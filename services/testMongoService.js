// import MongoDBService from "./MongoDBService.js";
import { format, subDays } from "date-fns";
import mongoDbService from "./mongoDbService.js";

const TEST_DB_NAME = "test_dummy";
const TEST_COLLECtions_NAME = "test_dummy_records";

async function runTests() {
  try {
    // Connect to MongoDB with the test database name
    await mongoDbService.connect(TEST_DB_NAME, TEST_COLLECtions_NAME);

    // Insert dummy records
    await insertDummyRecords();

    // Test getLatestSerialNumber
    const latestSerial = await mongoDbService.getLatestSerialNumber();
    console.log("Latest Serial Number:", latestSerial);

    // Test getRecordsByDateRange
    const endDate = new Date();
    const startDate = subDays(endDate, 7); // Last 7 days
    const dateRangeRecords = await mongoDbService.getRecordsByDateRange(
      startDate,
      endDate
    );
    console.log("Records in the last 7 days:", dateRangeRecords.length);

    // Test getRecordsByShift
    const shiftRecords = await mongoDbService.getRecordsByShift(
      "A",
      new Date()
    );
    console.log("Records for Shift A today:", shiftRecords.length);

    // Test updateRecord
    if (dateRangeRecords.length > 0) {
      const recordToUpdate = dateRangeRecords[0];
      const updateResult = await mongoDbService.updateRecord(
        recordToUpdate._id,
        { Status: "Updated" }
      );
      console.log("Update result:", updateResult);
    }
  } catch (error) {
    console.error("Test error:", error);
  } finally {
    // Disconnect from MongoDB
    await mongoDbService.disconnect();
  }
}

async function insertDummyRecords() {
  const shifts = ["A", "B", "C"];
  const statuses = ["OK", "NG"];

  for (let i = 0; i < 20; i++) {
    const date = subDays(new Date(), Math.floor(Math.random() * 7));
    const record = {
      Timestamp: date,
      SerialNumber: (1000 + i).toString(),
      ScannerData: `SCAN${i}`,
      OCRData: `OCR${i}`,
      Grade: String.fromCharCode(65 + Math.floor(Math.random() * 5)), // A to E
      Status: statuses[Math.floor(Math.random() * statuses.length)],
      Shift: shifts[Math.floor(Math.random() * shifts.length)],
    };

    await mongoDbService.insertRecord(record);
  }

  console.log("Inserted 20 dummy records");
}

// runTests().catch(console.error);
