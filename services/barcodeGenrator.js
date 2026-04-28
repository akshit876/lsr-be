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

function stripLeadingDoubleZero(partNo) {
  if (typeof partNo !== "string") return partNo;
  const trimmed = partNo.trim();
  if (!trimmed.startsWith("00")) return partNo;
  const stripped = trimmed.replace(/^0+/, "");
  return stripped.length > 0 ? stripped : "0";
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
      // Use the last two digits of the year (e.g., "25" for 2025)
      const year = fullYear.slice(-2);

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

      // Get next serial number and ensure it's always exactly 5 digits
      let serialString =
        await this.serialNumberService.getNextDecSerialNumber2();
      serialString = String(serialString).padStart(5, "0").slice(-5); // Ensure exactly 5 digits

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
        const simpleBarcodeText = `${finalPartNumber}${julianDate}${serialString}`;
        logger.info("Generated fallback barcode text:", simpleBarcodeText);

        return {
          text: simpleBarcodeText,
          serialNo: serialString,
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
        const fieldNameLower = field.fieldName.toLowerCase().trim();

        // Match field names more flexibly
        if (
          fieldNameLower.includes("production year") &&
          !fieldNameLower.includes("day")
        ) {
          mappedValue = year;
        } else if (
          fieldNameLower.includes("day of production year") ||
          fieldNameLower === "julian date" ||
          (fieldNameLower.includes("day") &&
            fieldNameLower.includes("production year"))
        ) {
          mappedValue = julianDate;
        } else if (
          fieldNameLower.includes("serial") ||
          fieldNameLower.includes("production counter") ||
          fieldNameLower.includes("day production counter")
        ) {
          // Always use the fresh serial number from the service - NEVER use old config value
          mappedValue = serialString;
          logger.info(
            `🔢 SERIAL NUMBER MAPPING: Field "${field.fieldName}" matched - using fresh serial: ${serialString} (was: "${field.value}")`
          );
        } else {
          mappedValue = field.value || "";
        }
        const mappedField = { ...field, value: mappedValue };
        logger.info(
          `🔍 Debug - Mapped ${field.fieldName}: "${field.value}" → "${mappedValue}"`
        );
        return mappedField;
      });

      // Double-check: Ensure serial number is in the barcode even if field mapping failed
      // Find any field that might be the serial number and force update it
      const serialField = fields.find((f) => {
        const name = f.fieldName.toLowerCase().trim();
        return name.includes("serial") || name.includes("counter");
      });
      if (serialField && serialField.value !== serialString) {
        logger.warn(
          `⚠️ Serial number field "${serialField.fieldName}" had value "${serialField.value}" but should be "${serialString}" - forcing update`
        );
        serialField.value = serialString;
      }

      logger.info("🔍 Debug - Fields after mapping (checked only):");
      fields
        .filter((field) => field.isChecked)
        .sort((a, b) => a.order - b.order)
        .forEach((field, index) => {
          logger.info(
            `  ${index}: [${field.order}] ${field.fieldName} = "${field.value}"`
          );
        });

      // Generate barcode by combining only checked fields in order, EXCLUDING Buffer 1
      const checkedFields = fields
        .filter((field) => field.isChecked && field.fieldName !== "Buffer 1") // Exclude Buffer 1
        .sort((a, b) => a.order - b.order); // Sort by order

      logger.info("🔍 Fields included in barcode (in order):");
      checkedFields.forEach((field, idx) => {
        logger.info(
          `  ${idx + 1}. [Order: ${field.order}] ${field.fieldName} = "${field.value}"`
        );
      });

      const barcodeText = checkedFields
        .map((field) => field.value || "") // Get values
        .join(""); // Join without separator

      logger.info(`✅ Generated barcode text: "${barcodeText}"`);
      logger.info(`🔢 Expected serial number in barcode: "${serialString}"`);

      // Verify serial number is in the barcode
      if (!barcodeText.includes(serialString)) {
        logger.error(
          `❌ CRITICAL: Serial number "${serialString}" is NOT in barcode text "${barcodeText}"!`
        );
        logger.error(
          `   This means the serial number field is either not checked or not mapped correctly.`
        );
      } else {
        logger.info(
          `✅ Verified: Serial number "${serialString}" is present in barcode text`
        );
      }

      // --- Generate codeToPrint in two-line format ---
      // Format: Line 1: DD + MonthLetter + YY + SerialNumber (e.g., "02J2400001")
      //         Line 2: PartNumber + "-" + LastTwoDigitsAfterDash (e.g., "8875867-03")

      // Month letter mapping (A=Jan, B=Feb, C=Mar, D=Apr, E=May, F=Jun, G=Jul, H=Aug, J=Sep, K=Oct, L=Nov, M=Dec - I is skipped)
      const monthLetters = [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "J",
        "K",
        "L",
        "M",
      ];
      const monthIndex = now.getMonth(); // 0-11
      const monthLetter = monthLetters[monthIndex];

      // Line 1: DD + MonthLetter + YY + SerialNumber
      const dd = String(now.getDate()).padStart(2, "0");
      const yy = String(now.getFullYear()).slice(-2);
      const line1 = `${dd}${monthLetter}${yy}${serialString}`;

      // Line 2: Extract PART NO and get last two digits after dash

      // Helper to get field value by name
      function getFieldValue(name) {
        const f = configData.currentModelConfig.fields.find(
          (f) => f.fieldName === name
        );
        return f ? f.value : "";
      }

      // Get PART NO from config
      let partNo = getFieldValue("PART NO");
      if (!partNo || partNo.trim() === "") {
        logger.warn("⚠️ PART NO not found in config, using finalPartNumber");
        partNo = finalPartNumber;
      }
      // Requirement: remove starting "00" from PART NO in text file output
      partNo = stripLeadingDoubleZero(partNo);

      // Extract last two digits from PART NO and remove them from the main part
      let partNoWithoutLastTwo = partNo;
      let lastTwoDigits = "00"; // Default if no digits found

      if (partNo) {
        // Extract only digits from PART NO to find last 2 digits
        const digitsOnly = partNo.replace(/\D/g, ""); // Remove all non-digits
        if (digitsOnly.length >= 2) {
          lastTwoDigits = digitsOnly.slice(-2); // Get last 2 digits (e.g., "03")

          // Remove last 2 digit characters from PART NO
          // Find positions of all digits, then remove the last 2
          const digitPositions = [];
          for (let i = 0; i < partNo.length; i++) {
            if (/\d/.test(partNo[i])) {
              digitPositions.push(i);
            }
          }

          if (digitPositions.length >= 2) {
            // Remove the last 2 digit positions
            const positionsToRemove = digitPositions.slice(-2);
            // Build new string excluding those positions
            partNoWithoutLastTwo = "";
            for (let i = 0; i < partNo.length; i++) {
              if (!positionsToRemove.includes(i)) {
                partNoWithoutLastTwo += partNo[i];
              }
            }
          }
        } else if (digitsOnly.length === 1) {
          lastTwoDigits = `0${digitsOnly}`; // Pad single digit
          // Remove the single digit
          const digitIndex = partNo.lastIndexOf(digitsOnly);
          if (digitIndex !== -1) {
            partNoWithoutLastTwo =
              partNo.slice(0, digitIndex) + partNo.slice(digitIndex + 1);
          }
        }
      }

      // Line 2: PART NO (without last 2 digits) + "-" + LastTwoDigits
      const line2 = `${partNoWithoutLastTwo}-${lastTwoDigits}`;

      // Combine into two-line format
      const codeToPrint = `${line1}\n${line2}`;

      logger.info(`Generated codeToPrint - Line 1: ${line1}, Line 2: ${line2}`);

      return {
        text: barcodeText,
        serialNo: serialString,
        fields: fields,
        codeToPrint,
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
      // Fetch the next serial number and ensure it's always exactly 5 digits
      let serialString =
        await this.serialNumberService.getNextDecSerialNumber2();
      serialString = String(serialString).padStart(5, "0").slice(-5); // Ensure exactly 5 digits

      // Generate the final barcode string including the part number
      const barcodeText = `${fetchedPartNumber || ""}04101${julianDate}${serialString}`;

      return {
        text: barcodeText,
        serialNo: serialString,
      };
    } else {
      // Fetch the next serial number and ensure it's always exactly 5 digits
      let serialString =
        await this.serialNumberService.getNextDecSerialNumber2();
      serialString = String(serialString).padStart(5, "0").slice(-5); // Ensure exactly 5 digits

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
