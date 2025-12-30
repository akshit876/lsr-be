// Test script to verify month conversion: 1-9 use digits, 10-12 use X, Y, Z
function testMonthConversion() {
  console.log("🧪 Testing Month Conversion (1-9 as digits, 10-12 as X, Y, Z)");
  console.log("=".repeat(50));

  // Test all months
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    let month;
    if (monthNum <= 9) {
      month = String(monthNum); // Use digits 1-9
    } else {
      // Months 10, 11, 12 map to X, Y, Z
      month = ["X", "Y", "Z"][monthNum - 10];
    }
    console.log(`Month ${monthNum.toString().padStart(2, "0")} → ${month}`);
  }

  console.log("=".repeat(50));
  console.log("✅ Month conversion test completed!");
  console.log("");
  console.log("📅 Expected format:");
  console.log("  01 (January)  → 1");
  console.log("  02 (February) → 2");
  console.log("  03 (March)    → 3");
  console.log("  04 (April)    → 4");
  console.log("  05 (May)      → 5");
  console.log("  06 (June)     → 6");
  console.log("  07 (July)     → 7");
  console.log("  08 (August)   → 8");
  console.log("  09 (September)→ 9");
  console.log("  10 (October)  → X");
  console.log("  11 (November) → Y");
  console.log("  12 (December) → Z");
}

// Run the test
testMonthConversion();
