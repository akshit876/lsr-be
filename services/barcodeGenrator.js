import { format } from "date-fns";
import SerialNumberGeneratorService from "./serialNumber.js";
import logger from "../logger.js";

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

  generateBarcodeData(date = new Date()) {
    const dateString = format(date, "ddMMyy");
    const shift = this.shiftUtility.getCurrentShift(date);
    // const shiftCode = this.getShiftCode(shift);
    const serialString = this.serialNumberService.getNextSerialNumber();

    return {
      text: `${dateString}${shift}${serialString}`,
      serialNo: serialString,
    };
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
