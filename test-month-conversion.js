// Test script to verify month conversion from numbers to alphabets
function testMonthConversion() {
  console.log("🧪 Testing Month Conversion (Numbers to Alphabets)");
  console.log("=".repeat(50));

  // Test all months
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    const month = String.fromCharCode(64 + monthNum); // ASCII 65=A, 66=B, etc.
    console.log(`Month ${monthNum.toString().padStart(2, "0")} → ${month}`);
  }

  console.log("=".repeat(50));
  console.log("✅ Month conversion test completed!");
  console.log("");
  console.log("📅 Expected format:");
  console.log("  01 (January)  → A");
  console.log("  02 (February) → B");
  console.log("  03 (March)    → C");
  console.log("  04 (April)    → D");
  console.log("  05 (May)      → E");
  console.log("  06 (June)     → F");
  console.log("  07 (July)     → G");
  console.log("  08 (August)   → H");
  console.log("  09 (September)→ I");
  console.log("  10 (October)  → J");
  console.log("  11 (November) → K");
  console.log("  12 (December) → L");
}

// Run the test
testMonthConversion();
