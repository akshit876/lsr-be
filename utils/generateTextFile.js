import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import CONFIG from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Utility to generate text file with the specified format:
 * 1=julian date
 * 2=single digit year code
 * 3=Company code (fixed R)
 * 4=DMCcode
 */

export class TextFileGenerator {
  constructor(config = CONFIG) {
    this.config = config;
  }

  /**
   * Get current Julian date (day of year)
   * @returns {number} Julian date (1-366)
   */
  getJulianDate() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    return dayOfYear;
  }

  /**
   * Get single digit year code
   * @returns {number} Last digit of current year (e.g., 2024 -> 4)
   */
  getSingleDigitYearCode() {
    const year = new Date().getFullYear();
    return year % 10;
  }

  /**
   * Get company code (fixed as 'R')
   * @returns {string} Company code
   */
  getCompanyCode() {
    return this.config.TEXT_FILE_FORMAT.COMPANY_CODE;
  }

  /**
   * Get DMC code
   * @returns {string} DMC code
   */
  getDMCcode() {
    return this.config.TEXT_FILE_FORMAT.DMC_CODE;
  }

  /**
   * Generate the complete text file content
   * @returns {string} Formatted text content
   */
  generateContent() {
    const julianDate = this.getJulianDate();
    const yearCode = this.getSingleDigitYearCode();
    const companyCode = this.getCompanyCode();
    const dmcCode = this.getDMCcode();

    const content = `1=${julianDate}
2=${yearCode}
3=${companyCode}
4=${dmcCode}`;

    return content;
  }

  /**
   * Write content to text file
   * @param {string} filePath - Path to write the file
   * @param {string} content - Content to write
   * @returns {boolean} Success status
   */
  writeToFile(filePath, content) {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, "utf8");
      return true;
    } catch (error) {
      console.error("Error writing to file:", error);
      return false;
    }
  }

  /**
   * Generate and write text file
   * @param {string} filePath - Optional custom file path
   * @returns {boolean} Success status
   */
  generateAndWrite(filePath = null) {
    try {
      const targetPath = filePath || this.config.PATHS.TEXT_FILE;
      const content = this.generateContent();

      const success = this.writeToFile(targetPath, content);

      if (success) {
        console.log("✅ Text file generated successfully!");
        console.log("📁 File location:", targetPath);
        console.log("\n📋 Content:");
        console.log(content);
      }

      return success;
    } catch (error) {
      console.error("❌ Error generating text file:", error);
      return false;
    }
  }

  /**
   * Get current values without writing to file
   * @returns {object} Current values
   */
  getCurrentValues() {
    return {
      julianDate: this.getJulianDate(),
      yearCode: this.getSingleDigitYearCode(),
      companyCode: this.getCompanyCode(),
      dmcCode: this.getDMCcode(),
    };
  }
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new TextFileGenerator();
  generator.generateAndWrite();
}
