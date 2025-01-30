import logger from "../../logger.js";
import mongoDbService from "../mongoDbService.js";
import { format } from "date-fns";

export class MongoDBHandler {
  async saveToMongoDB({
    io,
    serialNumber,
    markingData,
    scannerData,
    grading,
    result,
    isUpdate = false,
  }) {
    const now = new Date();
    const timestamp = format(now, "yyyy-MM-dd HH:mm:ss");

    try {
      const userDetails = await mongoDbService.getUserDetails();
      const currentId = await this.getCurrentDayId();

      const data = {
        Timestamp: new Date(timestamp),
        SerialNumber: serialNumber,
        MarkingData: markingData,
        ScannerData: scannerData,
        Result: this._formatResult(result),
        User: userDetails?.email || "Unknown",
        Grade: grading?.toUpperCase(),
        CurrentId: currentId,
      };

      if (isUpdate) {
        await this._updateRecord(data, serialNumber);
      } else {
        await this._insertRecord(data);
      }

      if (io) {
        await mongoDbService.sendMongoDbDataToClient(
          io,
          "main-data",
          "records"
        );
      }
    } catch (error) {
      logger.error("Error saving data:", error);
      throw error;
    }
  }

  _formatResult(result) {
    if (!result) return "NG";
    return result === "N/A"
      ? "N/A"
      : result === "OK" || result === true
        ? "OK"
        : "NG";
  }

  async _updateRecord(data, serialNumber) {
    await mongoDbService.updateLastRecord(
      { SerialNumber: serialNumber },
      { $set: data },
      "main-data",
      "records"
    );
    logger.info(`Updated MongoDB record for SerialNumber: ${serialNumber}`);
  }

  async _insertRecord(data) {
    await mongoDbService.insertRecord(data, "main-data", "records");
    logger.info(`Data saved to MongoDB with CurrentId: ${data.CurrentId}`);
  }
}
