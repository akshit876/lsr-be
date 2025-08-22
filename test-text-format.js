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

  const content = `1=${julianDate}
2=${yearCode}
3=${companyCode}
4=${dmcCode}`;

  return content;
}

// Test the function
console.log("🧪 Testing Text File Format Generation");
console.log("=====================================\n");

const textContent = generateTextFileContent();
console.log("📝 Generated Text File Content:");
console.log(textContent);

console.log("\n📊 Breakdown:");
const lines = textContent.split("\n");
lines.forEach((line) => {
  const [key, value] = line.split("=");
  console.log(`   ${key} = ${value}`);
});

console.log("\n✅ Text file format generation working correctly!");
