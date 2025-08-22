import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate text file with the specified format:
 * 1=julian date
 * 2=single digit year code
 * 3=Company code (fixed R)
 * 4=DMCcode
 */

function getJulianDate() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  return dayOfYear;
}

function getSingleDigitYearCode() {
  const year = new Date().getFullYear();
  // Get the last digit of the year (e.g., 2024 -> 4)
  return year % 10;
}

function getCompanyCode() {
  // Fixed company code as requested
  return "R";
}

function getDMCcode() {
  // DMC code - you can customize this based on your requirements
  // For now, using a sample format
  return "DMC001";
}

function generateTextFileContent() {
  const julianDate = getJulianDate();
  const yearCode = getSingleDigitYearCode();
  const companyCode = getCompanyCode();
  const dmcCode = getDMCcode();

  const content = `1=${julianDate}
2=${yearCode}
3=${companyCode}
4=${dmcCode}`;

  return content;
}

function main() {
  try {
    const textFilePath = path.join(__dirname, "data", "text.txt");
    const content = generateTextFileContent();

    // Write to file
    fs.writeFileSync(textFilePath, content, "utf8");

    console.log("✅ Text file generated successfully!");
    console.log("📁 File location:", textFilePath);
    console.log("\n📋 Content:");
    console.log(content);
  } catch (error) {
    console.error("❌ Error generating text file:", error);
  }
}

// Run the script
main();
