import cron from "node-cron";
import { createObjectCsvWriter } from "csv-writer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import mongoDbService from "./mongoDbService.js";
import logger from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CronService {
  constructor() {
    this.jobs = {};
  }

  async generateMonthlyCsv() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth()).padStart(2, "0"); // Previous month
    const fileName = `${year}-${month}-export.csv`;
    const filePath = path.join(__dirname, "..", "exports", fileName);

    // Ensure the exports directory exists
    if (!fs.existsSync(path.join(__dirname, "..", "exports"))) {
      fs.mkdirSync(path.join(__dirname, "..", "exports"));
    }

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: "Timestamp", title: "Timestamp" },
        { id: "SerialNumber", title: "SerialNumber" },
        { id: "MarkingData", title: "MarkingData" },
        { id: "ScannerData", title: "ScannerData" },
        { id: "Shift", title: "Shift" },
        { id: "Result", title: "Result" },
        { id: "Date", title: "Date" },
      ],
    });

    try {
      // Connect to MongoDB if not already connected
      if (!mongoDbService.collection) {
        await mongoDbService.connect("main-data", "records");
      }

      // Get the start and end dates for the previous month
      const startDate = new Date(year, date.getMonth() - 1, 1);
      const endDate = new Date(year, date.getMonth(), 0);

      // Fetch data from MongoDB for the previous month
      const data = await mongoDbService.collection
        .find({
          Timestamp: { $gte: startDate, $lte: endDate },
        })
        .toArray();

      // Write data to CSV
      await csvWriter.writeRecords(data);

      logger.info(`Monthly CSV export completed: ${fileName}`);
    } catch (error) {
      logger.error("Error generating monthly CSV:", error);
    }
  }

  scheduleJob(name, cronExpression, jobFunction) {
    this.jobs[name] = cron.schedule(cronExpression, jobFunction);
    logger.info(`Scheduled job: ${name}`);
  }

  startAllJobs() {
    Object.values(this.jobs).forEach((job) => job.start());
    logger.info("All cron jobs started");
  }

  stopAllJobs() {
    Object.values(this.jobs).forEach((job) => job.stop());
    logger.info("All cron jobs stopped");
  }
}

export default new CronService();
