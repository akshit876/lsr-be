import { format } from "date-fns";
import SerialNumberGeneratorService from "./serialNumber.js";
import logger from "../logger.js";
import mongoDbService from "./mongoDbService.js";
import { fetchPartNumberAndData } from "../server.js";

// async function fetchPartNumberAndData(mongoDbService) {
//   try {
//     // Connect to the MongoDB if not already connected
//     if (!mongoDbService.collection) {
//       await mongoDbService.connect("main-data", "config");
//     }

//     // Fetch part number from the 'configs' collection
//     const configData = await mongoDbService.collection.findOne({});
//     const partNumber = configData?.partNo || "Unknown Part No"; // Default value if part no is not found

//     // Fetch records from 'main-data' collection (or any other collection as needed)
//     const mainDataRecords = await mongoDbService.collection.find({}).toArray();

//     logger.info(`Fetched part number: ${partNumber} and main data records`);

//     return { partNumber, configData };
//   } catch (error) {
//     logger.error("Error fetching part number or data:", error);
//     throw error;
//   }
// }
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
    try {
      // Calculate date components
      const year = format(date, "yy");
      const month = format(date, "MM");
      const day = format(date, "dd");

      // Calculate Julian date
      const startOfYear = new Date(date.getFullYear(), 0, 0);
      const diff = date - startOfYear;
      const julianDay = Math.floor(diff / (1000 * 60 * 60 * 24))
        .toString()
        .padStart(3, "0");

      // Get current shift
      const shift = this.shiftUtility.getCurrentShift(date);

      // Fetch config and part number if not provided
      const { partNumber: fetchedPartNumber, configData } =
        await fetchPartNumberAndData(mongoDbService);

      // Use provided part number or fetched one
      const finalPartNumber = partNumber || fetchedPartNumber;

      // Get next serial number
      const serialString =
        await this.serialNumberService.getNextDecSerialNumber2();

      // Map values to fields from config
      const fields = configData.currentModelConfig.fields.map((field) => {
        switch (field.fieldName) {
          // case "PART NO":
          //   return { ...field, value: finalPartNumber };
          case "Year":
            return { ...field, value: year };
          case "Month":
            return { ...field, value: month };
          case "Date":
            return { ...field, value: day };
          case "Julian Date":
            return { ...field, value: julianDay };
          case "Serial Number":
            return { ...field, value: serialString };
          case "Shift":
            return { ...field, value: shift };
          // case "SUPPLIER CODE":
          //   return { ...field, value: "04101" }; // Hardcoded as per original
          default:
            return field;
        }
      });

      // Generate barcode by combining fields in order
      const barcodeText = fields
        .filter(
          (field) => field.isChecked && field.fieldName !== "Model Number"
        )
        .sort((a, b) => a.order - b.order)
        .map((field) => field.value || "")
        .join("");

      return {
        text: barcodeText,
        serialNo: serialString,
        fields: fields,
      };
    } catch (error) {
      console.error("Error generating barcode:", error);
      throw error;
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
