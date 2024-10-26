import { format } from "date-fns";
import SerialNumberGeneratorService from "./serialNumber.js";
import logger from "../logger.js";
import mongoDbService from "./mongoDbService.js";

async function fetchPartNumberAndData(mongoDbService) {
  try {
    // Connect to the MongoDB if not already connected
    if (!mongoDbService.collection) {
      await mongoDbService.connect("main-data", "config");
    }

    // Fetch part number from the 'configs' collection
    const configData = await mongoDbService.collection.findOne({});
    const partNumber = configData?.partNo || "Unknown Part No"; // Default value if part no is not found

    // Fetch records from 'main-data' collection (or any other collection as needed)
    const mainDataRecords = await mongoDbService.collection.find({}).toArray();

    logger.info(`Fetched part number: ${partNumber} and main data records`);

    return { partNumber, mainDataRecords };
  } catch (error) {
    logger.error("Error fetching part number or data:", error);
    throw error;
  }
}
class BarcodeGenerator {
  constructor(shiftUtility) {
    this.shiftUtility = shiftUtility;
    this.serialNumberService = SerialNumberGeneratorService;
  }

  async initialize(dbName, collectionName) {
    try {
      await this.serialNumberService.initialize(dbName, collectionName);
      logger.info("BarcodeGenerator initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize BarcodeGenerator:", error);
      throw error;
    }
  }

  async generateBarcodeData({ date = new Date(), mongoDbService, partNumber }) {
    // Get the Julian date: year + day of the year
    const year = format(date, "yy"); // Last two digits of the year
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff = date - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const julianDate = `${String(dayOfYear).padStart(3, "0")}${year}`; // Format day as 3 digits

    // Fetch the current shift
    const shift = this.shiftUtility.getCurrentShift(date);
    if (!partNumber) {
      const { partNumber, mainDataRecords } =
        await fetchPartNumberAndData(mongoDbService);
      console.log({ partNumber });
      // Fetch the next serial number
      const serialString = this.serialNumberService.getNextSerialNumber();

      // Generate the final barcode string including the part number
      const barcodeText = `${partNumber || ""}04101${julianDate}${serialString}`;

      return {
        text: barcodeText,
        serialNo: serialString,
      };
    } else {
      const serialString = this.serialNumberService.getNextSerialNumber();

      // Generate the final barcode string including the part number
      const barcodeText = `${partNumber || ""}04101${julianDate}${serialString}`;
      console.log({ serialString, partNumber, barcodeText });

      return {
        text: barcodeText,
        serialNo: serialString,
      };
    }
  }

  decSerialNo() {
    this.serialNumberService.decSerialNumber();
  }

  setResetTime(hour, minute) {
    this.serialNumberService.setResetTime(hour, minute);
  }
}

// // Usage example
// import ShiftUtility from "./ShiftUtility.js";

// const shiftUtility = new ShiftUtility();
// const barcodeGenerator = new BarcodeGenerator(shiftUtility);

// // Initialize the barcode generator
// await barcodeGenerator.initialize("your_db_name", "your_collection_name");

// // Set reset time if different from default (6:00 AM)
// barcodeGenerator.setResetTime(6, 0);

// // Generate barcode data for current date and time
// console.log(barcodeGenerator.generateBarcodeData());

// // Generate barcode data for a specific date and time
// const specificDate = new Date("2023-05-15T14:30:00");
// console.log(barcodeGenerator.generateBarcodeData(specificDate));

export default BarcodeGenerator;
