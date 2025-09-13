import { format } from "date-fns";
import SerialNumberGeneratorService from "./serialNumber.js";
import logger from "../logger.js";
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
  /**
 * 
 * @param { const { text, serialNo } = await this.barcodeGenerator.generateBarcodeData({  
      date: firstScanResult.parsedData.date,  
      shift: firstScanResult.parsedData.shift,
      year: firstScanResult.parsedData.year,
      month: firstScanResult.parsedData.month,
      monthLetter: firstScanResult.parsedData.monthLetter,
      dieNumber: firstScanResult.parsedData.dieNumber,
      currentDate: new Date(),
      mongoDbService,
      partNumber,
    });} param0 
 * @returns 

    await this.barcodeGenerator.generateBarcodeData({
        date: ocrScanResult.date,
        ocrShift: ocrScanResult.shift,
        ocrYear: ocrScanResult.year,
        ocrMonth: ocrScanResult.month,
        ocrMonthLetter: ocrScanResult.monthLetter,
        ocrDieNumber: ocrScanResult.dieNumber,
        mongoDbService,
        partNumber,
      });
 */
  async generateBarcodeData({
    ocrDate,
    ocrShift,
    ocrYear,
    ocrMonth,
    ocrDieNumber,
    mongoDbService,
    partNumber,
  }) {
    try {
      // Use current date for all timestamp-based fields
      const now = new Date();
      const fullYear = now.getFullYear().toString();
      // Use the last two digits of the year (e.g., "25" for 2025)
      const year = fullYear.slice(-2);
      const month = format(now, "MM");
      const day = format(now, "dd");
      const shift = this.shiftUtility.getCurrentShift(now);

      // Calculate Julian Date (day of year)
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const dayOfYear =
        Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
      const julianDate = dayOfYear.toString().padStart(3, "0"); // 3-digit format

      // Use month directly without conversion (e.g., "09" instead of "I")
      const monthLetterValue = month;

      // Fetch config and part number if not provided
      const { partNumber: fetchedPartNumber, configData } =
        await fetchPartNumberAndData(mongoDbService);

      // Use provided part number or fetched one
      const finalPartNumber = partNumber || fetchedPartNumber;

      // Get next serial number
      const serialString =
        await this.serialNumberService.getNextDecSerialNumber2();

      // Map values to fields from config with comprehensive field handling
      const fields = configData.currentModelConfig.fields.map((field) => {
        switch (field.fieldName) {
          case "PART NO":
            return { ...field, value: field.value || finalPartNumber };
          case "SUPPLIER CODE":
            return { ...field, value: field.value || "" };
          case "MACHINE NO":
            return { ...field, value: field.value || "" };
          case "Julian Date":
            return { ...field, value: julianDate };
          case "Year":
            return { ...field, value: year };
          case "Month":
            return { ...field, value: monthLetterValue };
          case "Date":
            return { ...field, value: day };
          case "Serial Number":
            return { ...field, value: serialString };
          case "COMPANY CODE":
            return { ...field, value: field.value || "" };
          case "FOR STORE":
            return { ...field, value: field.value || "" };
          case "STORE":
            return { ...field, value: field.value || "" };
          case "Shift":
            return { ...field, value: shift };
          case "Model Number":
            // Model number is typically not included in the final barcode
            return { ...field, value: field.value || "" };
          default:
            // For any other fields, use the stored value or empty string
            return { ...field, value: field.value || "" };
        }
      });

      // Generate barcode by combining fields in order (excluding Model Number and unchecked fields)
      const barcodeText = fields
        .filter(
          (field) =>
            field.isChecked &&
            field.fieldName !== "Model Number" &&
            field.order < 999 // Exclude fields with order 999+ (typically unchecked fields)
        )
        .sort((a, b) => a.order - b.order)
        .map((field) => field.value || "")
        .join("");

      logger.info("=== BARCODE GENERATION DETAILS ===");
      logger.info("Configuration-based field mapping:");

      const selectedFields = fields
        .filter(
          (field) =>
            field.isChecked &&
            field.fieldName !== "Model Number" &&
            field.order < 999
        )
        .sort((a, b) => a.order - b.order);

      selectedFields.forEach((field) => {
        logger.info(
          `  ${field.order}. ${field.fieldName}: "${field.value}" (checked: ${field.isChecked})`
        );
      });

      logger.info(`Generated barcode: "${barcodeText}"`);
      logger.info(`Serial number: ${serialString}`);
      logger.info("=== END BARCODE DETAILS ===");

      // Get the current decade digit dynamically
      const currentYear = new Date().getFullYear().toString();

      // Get only the last digit of the year
      const formattedOcrYear =
        ocrYear?.toString().slice(-1) || currentYear.slice(-1);

      // For simplified marking workflow (no OCR data), just return the barcode
      if (!ocrDate && !ocrShift && !ocrDieNumber) {
        logger.info("Simplified marking mode - no OCR data to append");
        return {
          text: barcodeText,
          codeText: barcodeText, // Same as text for simplified mode
          serialNo: serialString,
          fields: fields,
        };
      }

      // Append OCR data to barcode text (for scanning workflows)
      const ocrDateFormatted = `${ocrDate}${ocrMonth}${formattedOcrYear}`;
      const ocrData = `${ocrDieNumber}${ocrDateFormatted}${ocrShift}`;
      const finalText = barcodeText + ocrData;
      logger.info("Final text with OCR data:", finalText);

      return {
        text: barcodeText,
        codeText: finalText,
        serialNo: serialString,
        fields: fields,
      };
    } catch (error) {
      logger.error("Error generating barcode:", error);
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
