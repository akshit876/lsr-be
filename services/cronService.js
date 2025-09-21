import cron from "node-cron";
import { createObjectCsvWriter } from "csv-writer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import mongoDbService from "./mongoDbService.js";
import logger from "../logger.js";
import ExcelJS from "exceljs";
import { format } from "date-fns";

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

  async generateDailyCsv() {
    try {
      const endDate = new Date();
      endDate.setHours(6, 0, 0, 0);

      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 1);

      const dateStr = startDate.toISOString().split("T")[0];
      const filename = `daily_report_${dateStr}.xlsx`;

      // Query MongoDB for records
      const records = await mongoDbService.collection
        .find({
          timestamp: {
            $gte: startDate,
            $lt: endDate,
          },
        })
        .toArray();

      // Format the data
      const formattedData = records.map((row, index) => {
        let scannerDataWithoutGrade = row.ScannerData || "";
        let grade = "";

        if (row.ScannerData !== "NG" && row.ScannerData) {
          grade = row.ScannerData.slice(-1);
          scannerDataWithoutGrade = row.ScannerData.slice(0, -1);
        }

        return {
          SerialNumber: index + 1,
          Timestamp: format(new Date(row.Timestamp), "dd/MM/yyyy HH:mm:ss"),
          MarkingData: row.MarkingData || "",
          ScannerData: scannerDataWithoutGrade,
          Grade: grade,
          Result: row.Result || "",
          User: row.User || "",
        };
      });

      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Daily Report");

      // Define columns
      worksheet.columns = [
        { header: "SerialNumber", key: "SerialNumber", width: 15 },
        { header: "Timestamp", key: "Timestamp", width: 20 },
        { header: "MarkingData", key: "MarkingData", width: 15 },
        { header: "ScannerData", key: "ScannerData", width: 15 },
        { header: "Grade", key: "Grade", width: 10 },
        { header: "Result", key: "Result", width: 10 },
        { header: "User", key: "User", width: 15 },
      ];

      // Add data rows
      formattedData.forEach((row) => {
        const dataRow = worksheet.addRow(row);

        // Apply conditional formatting for Result column
        const resultCell = dataRow.getCell("Result");
        if (row.Result === "OK") {
          resultCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "90EE90" }, // Light green
          };
        } else if (row.Result === "NG") {
          resultCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFB6C1" }, // Light red
          };
        }
      });

      // Freeze the header row
      worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

      // Style the header row
      worksheet.getRow(1).font = { bold: true };

      // Auto-fit columns (with some padding)
      worksheet.columns.forEach((column) => {
        const maxLength = Math.max(
          column.header.length,
          ...formattedData.map((row) =>
            row[column.key] ? row[column.key].toString().length : 10
          )
        );
        column.width = maxLength + 7; // Add padding
      });

      // Save the file
      const exportPath = path.join("D:", "LaserMarkingReports", filename);

      // Create directory if it doesn't exist
      const directory = path.join("D:", "LaserMarkingReports");
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }

      await workbook.xlsx.writeFile(exportPath);

      logger.info(`Daily report generated: ${exportPath}`);
    } catch (error) {
      logger.error("Error generating daily report:", error);
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
