#!/usr/bin/env node

/**
 * Quick COM Port Test
 *
 * Simple script to quickly test if COM3 can be opened and listen for data
 *
 * Usage: node quick-comport-test.js
 */

import BufferedComPortService from "./services/ComPortService.js";

console.log("🚀 Quick COM Port Test Starting...");
console.log("=====================================");

const comService = new BufferedComPortService({
  path: "COM3",
  baudRate: 9600,
  logDir: "quick_test_logs",
});

async function quickTest() {
  try {
    // Test 1: Connection
    console.log("📡 Testing COM3 connection...");
    await comService.initSerialPort();
    console.log("✅ COM3 connected successfully!");

    // Test 2: Listen for data
    console.log("👂 Listening for data for 10 seconds...");
    console.log("💡 Try scanning a barcode or sending data via terminal");

    let dataReceived = false;

    comService.on("dataGot", (data) => {
      dataReceived = true;
      console.log(`📥 Data received: "${data}"`);
      console.log(`📊 Data length: ${data.length} characters`);
      console.log(`🔤 Data type: ${typeof data}`);
    });

    // Wait for 10 seconds
    await new Promise((resolve) => setTimeout(resolve, 10000));

    if (dataReceived) {
      console.log("✅ Data reception test PASSED!");
    } else {
      console.log("⚠️ No data received during test period");
      console.log("💡 Possible reasons:");
      console.log("   - Scanner not connected or powered off");
      console.log("   - Scanner needs manual trigger");
      console.log("   - Wrong baud rate (currently using 9600)");
      console.log("   - Scanner not configured to send data");
    }

    // Cleanup
    await comService.closePort();
    console.log("✅ COM port closed successfully");
    console.log("🎉 Quick test completed!");
  } catch (error) {
    console.error("❌ Error:", error.message);

    if (error.message.includes("Access denied")) {
      console.log("💡 Solution: Run as Administrator");
    } else if (error.message.includes("File not found")) {
      console.log("💡 Solution: Check if COM3 device is connected");
    }

    process.exit(1);
  }
}

// Handle Ctrl+C
process.on("SIGINT", async () => {
  console.log("\n👋 Test interrupted by user");
  try {
    await comService.closePort();
  } catch (e) {
    // Ignore cleanup errors
  }
  process.exit(0);
});

quickTest();
