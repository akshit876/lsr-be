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
    ocrMonthLetter,
    ocrDieNumber,
    mongoDbService,
    partNumber,
  }) {
    try {
      // Use current date for all timestamp-based fields
      const now = new Date();
      const year = format(now, "yy");
      const month = format(now, "MM");
      const day = format(now, "dd");
      const shift = this.shiftUtility.getCurrentShift(now);

      // Convert month number to letter (1-12 to A-L)
      const monthToLetter = (monthNum) => {
        const monthInt = parseInt(monthNum);
        if (monthInt < 1 || monthInt > 12) {
          return "A"; // Default to A if invalid
        }
        return String.fromCharCode(64 + monthInt);
      };

      const monthLetterValue = monthToLetter(month);

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
            return { ...field, value: monthLetterValue };
          case "Date":
            return { ...field, value: day };
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
      logger.info(barcodeText);
      logger.info(serialString);

      // Calculate the century prefix based on the current year
      const currentYear = new Date().getFullYear();
      const centuryPrefix = Math.floor(currentYear / 100);
      const formattedOcrYear =
        ocrYear?.toString().length === 1
          ? `${centuryPrefix}${ocrYear}`
          : ocrYear;

      // Append OCR data to barcode text
      const ocrDateFormatted = `${ocrDate}${ocrMonthLetter}${formattedOcrYear}`;
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
