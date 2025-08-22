/**
 * Test script to verify the text file format generation
 * This simulates what happens in the scanCycles.js file
 */

// Simulate the generateTextFileContent method from ScannerController
function generateTextFileContent() {
  const now = new Date();

  // 1 = Julian date (day of year)
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const julianDate = Math.floor(diff / oneDay);

  // 2 = Single digit year code (last digit of year)
  const yearCode = now.getFullYear() % 10;

  // 3 = Company code (fixed as 'R')
  const companyCode = "R";

  // 4 = DMC code (you can customize this)
  const dmcCode = "DMC001";

  // Format: 1234 as ordering (not key-value pairs)
  const content = `${julianDate}${yearCode}${companyCode}${dmcCode}`;

  return content;
}

// Test the function
console.log("🧪 Testing text file generation...");
const textContent = generateTextFileContent();
console.log(`📄 Generated text content: ${textContent}`);

// Break down the components
const now = new Date();
const start = new Date(now.getFullYear(), 0, 0);
const diff = now - start;
const oneDay = 1000 * 60 * 60 * 24;
const julianDate = Math.floor(diff / oneDay);
const yearCode = now.getFullYear() % 10;

console.log("\n📊 Breakdown:");
console.log(
  `   1 = Julian date: ${julianDate} (day ${julianDate} of the year)`
);
console.log(
  `   2 = Year code: ${yearCode} (last digit of ${now.getFullYear()})`
);
console.log(`   3 = Company code: R (fixed)`);
console.log(`   4 = DMC code: DMC001 (customizable)`);

console.log(`\n✅ Text file generation test completed!`);
console.log(`📁 The text.txt file will now contain: ${textContent}`);
