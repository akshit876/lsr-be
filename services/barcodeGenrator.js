import { format } from "date-fns";
import SerialNumberGeneratorService from "./serialNumber.js";
import logger from "../logger.js";

async function fetchPartNumberAndData(mongoDbService) {
  try {
    // Connect to the MongoDB if not already connected
    if (!mongoDbService.collection) {
      await mongoDbService.connect("main-data", "config");
    }

    // Fetch part number and config data from the 'configs' collection
    const configData = await mongoDbService.collection.findOne({});
    const partNumber = configData?.partNo || "Unknown Part No"; // Default value if part no is not found

    logger.info(`Fetched part number: ${partNumber} and config data`);

    return { partNumber, configData };
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

  async generateBarcodeData({ mongoDbService, partNumber }) {
    try {
      // Use current date for all timestamp-based fields
      const now = new Date();
      const fullYear = now.getFullYear().toString();
      // Use only the last digit of the year
      const year = fullYear.slice(-1);
      const month = format(now, "MM");
      const day = format(now, "dd");
      const shift = this.shiftUtility.getCurrentShift(now);

      // Get Julian date (day of year)
      const startOfYear = new Date(now.getFullYear(), 0, 0);
      const diff = now - startOfYear;
      const oneDay = 1000 * 60 * 60 * 24;
      const dayOfYear = Math.floor(diff / oneDay);
      const julianDate = String(dayOfYear).padStart(3, "0");

      // Fetch config and part number if not provided
      const { partNumber: fetchedPartNumber, configData } =
        await fetchPartNumberAndData(mongoDbService);

      // Use provided part number or fetched one
      const finalPartNumber = partNumber || fetchedPartNumber;

      // Get next serial number
      const serialString =
        await this.serialNumberService.getNextDecSerialNumber2();

      // Map values to fields from config using exact field names from UI
      const fields = configData.currentModelConfig.fields.map((field) => {
        switch (field.fieldName) {
          case "PART NO":
            return { ...field, value: finalPartNumber };
          case "SERIAL NUMBER":
            return { ...field, value: serialString };
          case "FOR STORE":
            return { ...field, value: field.value || "" }; // Use configured value
          case "SHIFT":
            return { ...field, value: shift };
          case "STORE":
            return { ...field, value: field.value || "" }; // Use configured value
          case "YEAR":
            return { ...field, value: year };
          case "JULIAN DATE":
            return { ...field, value: julianDate };
          case "SUPPLIER CODE":
            return { ...field, value: field.value || "" }; // Use configured value
          case "MONTH":
            return { ...field, value: month };
          case "DATE":
            return { ...field, value: day };
          case "MACHINE NO":
            return { ...field, value: field.value || "" };
          case "COMPANY CODE":
            return { ...field, value: field.value || "" };
          default:
            return field;
        }
      });

      // Generate barcode by combining only checked fields in order
      const barcodeText = fields
        .filter((field) => field.isChecked) // Only include checked fields
        .sort((a, b) => a.order - b.order) // Sort by order
        .map((field) => field.value || "") // Get values
        .join(""); // Join without separator

      logger.info("Generated barcode text:", barcodeText);
      logger.info("Serial number:", serialString);

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

  // Keep the original method for backward compatibility
  async generateBarcodeDataLegacy({
    date = new Date(),
    mongoDbService,
    partNumber,
  }) {
    // Get the Julian date: year + day of the year
    const year = format(date, "yy"); // Last two digits of the year
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff = date - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const julianDate = `${String(dayOfYear).padStart(3, "0")}${year}`; // Format day as 3 digits

    if (!partNumber) {
      const { partNumber: fetchedPartNumber } =
        await fetchPartNumberAndData(mongoDbService);
      console.log({ partNumber: fetchedPartNumber });
      // Fetch the next serial number
      const serialString =
        await this.serialNumberService.getNextDecSerialNumber2();

      // Generate the final barcode string including the part number
      const barcodeText = `${fetchedPartNumber || ""}04101${julianDate}${serialString}`;

      return {
        text: barcodeText,
        serialNo: serialString,
      };
    } else {
      const serialString =
        await this.serialNumberService.getNextDecSerialNumber2();

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
