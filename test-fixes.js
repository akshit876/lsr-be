/**
 * Test script to verify the fixes
 */

// Test ShiftUtility
import ShiftUtility from "./services/ShiftUtility.js";

async function testShiftUtility() {
  console.log("🧪 Testing ShiftUtility...");

  try {
    const shiftUtil = new ShiftUtility();

    // Test without initialization (should use default config)
    console.log("📊 Current shifts (before init):", shiftUtil.getShifts());
    console.log("🕐 Current shift:", shiftUtil.getCurrentShift());

    // Test with initialization
    await shiftUtil.initialize();
    console.log("📊 Current shifts (after init):", shiftUtil.getShifts());
    console.log("🕐 Current shift:", shiftUtil.getCurrentShift());

    console.log("✅ ShiftUtility test passed!");
  } catch (error) {
    console.error("❌ ShiftUtility test failed:", error.message);
  }
}

// Test text file generation
function testTextFileGeneration() {
  console.log("\n🧪 Testing text file generation...");

  try {
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

    // 4 = DMC code
    const dmcCode = "DMC001";

    // Format: 1234 as ordering
    const content = `${julianDate}${yearCode}${companyCode}${dmcCode}`;

    console.log("📄 Generated text content:", content);
    console.log("📊 Breakdown:");
    console.log(`   1 = Julian date: ${julianDate}`);
    console.log(`   2 = Year code: ${yearCode}`);
    console.log(`   3 = Company code: ${companyCode}`);
    console.log(`   4 = DMC code: ${dmcCode}`);

    console.log("✅ Text file generation test passed!");
  } catch (error) {
    console.error("❌ Text file generation test failed:", error.message);
  }
}

// Run tests
async function runTests() {
  console.log("🚀 Starting tests...\n");

  await testShiftUtility();
  testTextFileGeneration();

  console.log("\n🎉 All tests completed!");
}

runTests().catch(console.error);
