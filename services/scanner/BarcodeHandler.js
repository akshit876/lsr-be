import logger from "../../logger.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import BarcodeGenerator from "../barcodeGenrator.js";
import ShiftUtility from "../ShiftUtility.js";
import mongoDbService from "../mongoDbService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CODE_FILE_PATH = path.join(__dirname, "../../data/code.txt");
const TEXT_FILE_PATH = path.join(__dirname, "../../data/text.txt");

export class BarcodeHandler {
  constructor() {
    this.shiftUtility = new ShiftUtility();
    this.barcodeGenerator = new BarcodeGenerator(this.shiftUtility);
  }

  async initialize() {
    await this.shiftUtility.initialize();
    await this.barcodeGenerator.initialize("main-data", "records");
  }

  async generateAndWriteBarcode(partNumber, io) {
    try {
      const { text, serialNo } =
        await this.barcodeGenerator.generateBarcodeData({
          date: new Date(),
          mongoDbService,
          partNumber,
        });

      const currentDate = new Date();
      const formattedDate = this.formatDateForSerial(currentDate);
      const serialWithDate = `${formattedDate}XX${serialNo}`;

      await Promise.all([
        this.writeToFile(CODE_FILE_PATH, text, "OCR data"),
        this.writeToFile(
          TEXT_FILE_PATH,
          serialWithDate,
          "Serial number with date"
        ),
      ]);

      if (io) {
        io.emit("marking_data", {
          timestamp: new Date(),
          data: text,
        });
      }

      const isVerified = await this.verifyAndRetryWrite(text, 2);
      if (isVerified) {
        await this.saveToMongoDB({
          io,
          serialNumber: serialNo,
          markingData: text,
          scannerData: "N/A",
          result: "N/A",
          grading: "N/A",
          isUpdate: false,
        });
      }

      return isVerified ? { text, serialNo } : null;
    } catch (error) {
      logger.error("❌ Error in barcode generation process:", error);
      throw error;
    }
  }

  formatDateForSerial(date) {
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear().toString().slice(-2);
    return `${day}${month}${year}`;
  }

  async writeToFile(filePath, data, description = "Data") {
    try {
      await fs.writeFile(filePath, data.toString(), "utf8");
      logger.info(`✅ ${description} written to ${path.basename(filePath)}`);

      const verificationData = await fs.readFile(filePath, "utf8");
      if (verificationData !== data.toString()) {
        throw new Error(
          `File verification failed for ${path.basename(filePath)}`
        );
      }
      return true;
    } catch (error) {
      logger.error(
        `❌ Error writing ${description.toLowerCase()} to ${path.basename(filePath)}:`,
        error
      );
      throw error;
    }
  }

  async verifyAndRetryWrite(expectedData, retriesLeft) {
    for (let attempt = 1; attempt <= retriesLeft + 1; attempt++) {
      const actualData = await fs.readFile(CODE_FILE_PATH, "utf8");
      if (actualData === expectedData) {
        return true;
      }
      if (attempt <= retriesLeft) {
        logger.warn(
          `Verification attempt ${attempt} failed. Retrying write operation...`
        );
        await fs.writeFile(CODE_FILE_PATH, expectedData, "utf8");
      }
    }
    return false;
  }
}
