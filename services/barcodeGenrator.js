import { format } from "date-fns";
import SerialNumberGeneratorService from "./serialNumber.js";
import logger from "../logger.js";

async function fetchPartNumberAndData(mongoDbService) {
  try {
    // Connect to the MongoDB if not already connected
    // if (!mongoDbService.collection) {
    await mongoDbService.connect("main-data", "config");
    // }

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
      // Check if serial number service is properly initialized
      if (
        !this.serialNumberService ||
        typeof this.serialNumberService.initialize !== "function"
      ) {
        logger.error("❌ Serial number service not properly initialized");
        throw new Error("Serial number service not available");
      }

      await this.serialNumberService.initialize(dbName, collectionName);
      logger.info("BarcodeGenerator initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize BarcodeGenerator:", error);
      throw error;
    }
  }

  // Generate text file content with the specified format: 1=julian date, 2=year code, 3=company code, 4=DMCcode
  generateTextFileContent() {
    const now = new Date();
    // 1 = Julian date (day of year) - always 3 digits (001-365)
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const julianDate = String(dayOfYear).padStart(3, "0");
    // 2 = Single digit year code (last digit of year)
    const yearCode = now.getFullYear() % 10;
    // 3 = Company code (fixed as 'R')
    // const companyCode = "R";
    // // 4 = DMC code (you can customize this)
    // const dmcCode = "DMC001";
    // Format: concatenated string (e.g., 2436 for day 243, year 6)
    const content = `${julianDate}${yearCode}`;
    return content;
  }

  async generateBarcodeData({ mongoDbService, partNumber }) {
    try {
      // Use current date for all timestamp-based fields
      const now = new Date();
      const fullYear = now.getFullYear().toString();
      // Use the last two digits of the year (e.g., "25" for 2025)
      const year = fullYear.slice(-2);
      // Convert month from number to alphabet: 1=A, 2=B, 3=C, ..., 12=L
      const monthNumber = now.getMonth() + 1; // getMonth() returns 0-11, so +1 gives 1-12
      const month = String.fromCharCode(64 + monthNumber); // ASCII 65=A, 66=B, etc.
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
      logger.info(`🔍 Debug - finalPartNumber: "${finalPartNumber}"`);
      logger.info(`🔍 Debug - fetchedPartNumber: "${fetchedPartNumber}"`);
      logger.info(`🔍 Debug - provided partNumber: "${partNumber}"`);

      // Get next serial number with better error handling
      let serialString;
      try {
        serialString = await this.serialNumberService.getNextDecSerialNumber2();

        // Safety check for serial number
        if (
          !serialString ||
          serialString === "undefined" ||
          serialString === "null" ||
          isNaN(parseInt(serialString, 10))
        ) {
          logger.error("❌ Invalid serial number generated:", serialString);
          logger.error("❌ Serial number type:", typeof serialString);
          serialString = await this.serialNumberService.getFallbackSerialNumber();
          logger.info("✅ Using safe fallback serial (from last used + 1 or model start):", serialString);
        } else {
          // Ensure serial number is always 4 digits
          const serialNumber = parseInt(serialString, 10);
          if (!isNaN(serialNumber)) {
            serialString = serialNumber.toString().padStart(4, "0");
            logger.info(
              `🔢 Serial number formatted to 4 digits: ${serialString}`
            );
          } else {
            logger.warn(
              "⚠️ Serial number is not a valid number, using safe fallback"
            );
            serialString = await this.serialNumberService.getFallbackSerialNumber();
          }
          logger.info(
            `🔢 Serial number generated successfully: ${serialString}`
          );
        }
      } catch (serialError) {
        logger.error("❌ Error generating serial number:", serialError);
        try {
          serialString = await this.serialNumberService.getFallbackSerialNumber();
          logger.info("✅ Recovered with safe fallback serial (from last used + 1 or model start):", serialString);
        } catch (fallbackError) {
          logger.error("❌ Fallback serial also failed:", fallbackError);
          serialString = "0001";
          logger.warn("⚠️ Last-resort fallback 0001 used; check DB and serial service.");
        }
      }

      // Check if configData has the expected structure
      if (
        !configData ||
        !configData.currentModelConfig ||
        !configData.currentModelConfig.fields
      ) {
        logger.warn(
          "⚠️ Config data structure not found, using fallback barcode generation"
        );
        // Fallback to simple barcode generation
        // Ensure serial number is 4 digits for fallback too
        const paddedSerialString = serialString.toString().padStart(4, "0");
        const simpleBarcodeText = `${finalPartNumber}${julianDate}${paddedSerialString}`;
        logger.info("Generated fallback barcode text:", simpleBarcodeText);

        // Generate text file content for fallback too
        const textFileContent = this.generateTextFileContent();
        logger.info(
          `📄 Fallback text file content generated: ${textFileContent}`
        );

        return {
          text: simpleBarcodeText,
          serialNo: serialString,
          textFileContent: textFileContent, // Add text file content to fallback return
          fields: [],
        };
      }

      logger.info("🔍 Debug - Config fields before mapping:");
      configData.currentModelConfig.fields.forEach((field, index) => {
        logger.info(
          `  ${index}: ${field.fieldName} = "${field.value}" (order: ${field.order}, checked: ${field.isChecked})`
        );
      });

      // Map values to fields from config using exact field names from UI
      const fields = configData.currentModelConfig.fields.map((field) => {
        let mappedValue;
        switch (field.fieldName) {
          case "PART NO":
            mappedValue = field.value || ""; // Use configured value
            break;
          case "Serial Number": // Note: "Serial Number" not "SERIAL NUMBER"
            mappedValue = serialString;
            break;
          case "FOR STORE":
            mappedValue = field.value || ""; // Use configured value
            break;
          case "Shift": // Note: "Shift" not "SHIFT"
            mappedValue = shift;
            break;
          case "STORE":
            mappedValue = field.value || ""; // Use configured value
            break;
          case "Year": // Note: "Year" not "YEAR"
            mappedValue = year;
            break;
          case "Julian Date": // Note: "Julian Date" not "JULIAN DATE"
            mappedValue = julianDate;
            break;
          case "SUPPLIER CODE":
            mappedValue = field.value || ""; // Use configured value
            break;
          case "Month": // Note: "Month" not "MONTH"
            mappedValue = month;
            break;
          case "Date": // Note: "Date" not "DATE"
            mappedValue = day;
            break;
          case "MACHINE NO":
            mappedValue = field.value || "";
            break;
          case "COMPANY CODE":
            mappedValue = field.value || "";
            break;
          case "Model Number":
            mappedValue = field.value || "";
            break;
          default:
            mappedValue = field.value || "";
            break;
        }

        const mappedField = { ...field, value: mappedValue };
        logger.info(
          `🔍 Debug - Mapped ${field.fieldName}: "${field.value}" → "${mappedValue}"`
        );
        return mappedField;
      });

      logger.info("🔍 Debug - Fields after mapping (checked only):");
      fields
        .filter((field) => field.isChecked)
        .sort((a, b) => a.order - b.order)
        .forEach((field, index) => {
          logger.info(
            `  ${index}: [${field.order}] ${field.fieldName} = "${field.value}"`
          );
        });

      // Generate barcode by combining only checked fields in order
      const barcodeText = fields
        .filter((field) => field.isChecked) // Only include checked fields
        .sort((a, b) => a.order - b.order) // Sort by order
        .map((field) => field.value || "") // Get values
        .join(""); // Join without separator

      logger.info("Generated barcode text:", barcodeText);
      logger.info("Serial number:", serialString);

      // Generate text file content for the specified format
      const textFileContent = this.generateTextFileContent();
      logger.info(`📄 Text file content generated: ${textFileContent}`);

      return {
        text: barcodeText,
        serialNo: serialString, // This is already padded to 4 digits from earlier
        textFileContent: textFileContent, // Add text file content to return object
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

      // Ensure serial number is 4 digits
      const paddedSerialString = serialString.toString().padStart(4, "0");

      // Generate the final barcode string including the part number
      const barcodeText = `${fetchedPartNumber || ""}04101${julianDate}${paddedSerialString}`;

      // Generate text file content for legacy method too
      const textFileContent = this.generateTextFileContent();
      logger.info(`📄 Legacy text file content generated: ${textFileContent}`);

      return {
        text: barcodeText,
        serialNo: paddedSerialString,
        textFileContent: textFileContent,
      };
    } else {
      const serialString =
        await this.serialNumberService.getNextDecSerialNumber2();

      // Ensure serial number is 4 digits
      const paddedSerialString = serialString.toString().padStart(4, "0");

      // Generate the final barcode string including the part number
      const barcodeText = `${partNumber || ""}04101${julianDate}${paddedSerialString}`;
      console.log({
        serialString: paddedSerialString,
        partNumber,
        barcodeText,
      });

      // Generate text file content for legacy method too
      const textFileContent = this.generateTextFileContent();
      logger.info(`📄 Legacy text file content generated: ${textFileContent}`);

      return {
        text: barcodeText,
        serialNo: paddedSerialString,
        textFileContent: textFileContent,
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
