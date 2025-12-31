// Test script to verify month conversion from numbers to alphabets
function testMonthConversion() {
  console.log("🧪 Testing Month Conversion (Numbers to Alphabets)");
  console.log("=".repeat(50));

  // Test all months
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    // Skip 'I': months 1-8 use A-H, months 9-12 use J, K, L, M
    const month = monthNum <= 8 
      ? String.fromCharCode(64 + monthNum) // A-H (ASCII 65-72)
      : String.fromCharCode(65 + monthNum); // J-M (ASCII 74-77, skipping I)
    console.log(`Month ${monthNum.toString().padStart(2, "0")} → ${month}`);
  }

  console.log("=".repeat(50));
  console.log("✅ Month conversion test completed!");
  console.log("");
  console.log("📅 Expected format (I is skipped):");
  console.log("  01 (January)  → A");
  console.log("  02 (February) → B");
  console.log("  03 (March)    → C");
  console.log("  04 (April)    → D");
  console.log("  05 (May)      → E");
  console.log("  06 (June)     → F");
  console.log("  07 (July)     → G");
  console.log("  08 (August)   → H");
  console.log("  09 (September)→ J (I skipped)");
  console.log("  10 (October)  → K");
  console.log("  11 (November) → L");
  console.log("  12 (December) → M");
}

// Run the test
testMonthConversion();
