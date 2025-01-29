import fs from "fs";
import logger from "../../logger.js";
import { PATHS } from "./constants.js";

export class FileManager {
  async writeToFile(path, data, description = "Data") {
    try {
      fs.writeFileSync(path, data, "utf8");
      logger.info(`${description} written to file: ${path}`);
      return true;
    } catch (error) {
      logger.error(
        `Error writing ${description.toLowerCase()} to file:`,
        error
      );
      throw error;
    }
  }

  async verifyAndRetryWrite(data, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const fileContent = fs.readFileSync(PATHS.CODE_FILE, "utf8").trim();
        if (fileContent === data) {
          logger.success(`File verification successful on attempt ${attempt}`);
          return true;
        }

        logger.warn(
          `File verification failed on attempt ${attempt}. Retrying...`
        );
        await this.writeToFile(PATHS.CODE_FILE, data, "Verification retry");
      } catch (error) {
        logger.error(
          `Error during file verification attempt ${attempt}:`,
          error
        );
        if (attempt === maxRetries) throw error;
      }
    }
    return false;
  }

  async clearFile(path) {
    try {
      fs.writeFileSync(path, "", "utf8");
      logger.info(`File cleared: ${path}`);
    } catch (error) {
      logger.error(`Error clearing file: ${path}`, error);
      throw error;
    }
  }

  readFile(path) {
    try {
      return fs.readFileSync(path, "utf8").trim();
    } catch (error) {
      logger.error(`Error reading file: ${path}`, error);
      throw error;
    }
  }
}
