// Test script to verify month conversion: 01 to 12 (zero-padded)
function testMonthConversion() {
  console.log("🧪 Testing Month Conversion (01–12 zero-padded)");
  console.log("=".repeat(50));

  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    const month = String(monthNum).padStart(2, "0");
    console.log(`Month ${monthNum} → ${month}`);
  }

  console.log("=".repeat(50));
  console.log("✅ Month conversion test completed!");
  console.log("");
  console.log("📅 Format: 01 (Jan), 02 (Feb), … 12 (Dec)");
}

testMonthConversion();
