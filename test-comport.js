#!/usr/bin/env node

/**
 * Standalone COM Port Service Test
 *
 * This script tests the BufferedComPortService independently
 * to diagnose scanner communication issues.
 *
 * Usage: node test-comport.js
 */

import BufferedComPortService from "./services/ComPortService.js";
import { promisify } from "util";

const sleep = promisify(setTimeout);

// Test configuration
const TEST_CONFIG = {
  path: "COM3",
  baudRate: 9600,
  logDir: "test_logs",
};

class ComPortTester {
  constructor() {
    this.comService = null;
    this.testResults = [];
  }

  log(message, type = "INFO") {
    const timestamp = new Date().toLocaleString();
    const logMessage = `${timestamp} [${type}] ${message}`;
    console.log(logMessage);
    this.testResults.push({ timestamp, type, message });
  }

  async runAllTests() {
    this.log("🚀 Starting COM Port Service Tests");
    this.log("=".repeat(60));

    try {
      await this.testConnection();
      await this.testDataListening();
      await this.testManualInput();
      await this.cleanup();

      this.log("✅ All tests completed successfully!");
      this.printSummary();
    } catch (error) {
      this.log(`❌ Test failed: ${error.message}`, "ERROR");
      await this.cleanup();
      process.exit(1);
    }
  }

  async testConnection() {
    this.log("🔧 Test 1: COM Port Connection");
    this.log("-".repeat(40));

    try {
      this.log(
        `Attempting to connect to ${TEST_CONFIG.path} at ${TEST_CONFIG.baudRate} baud...`
      );

      this.comService = new BufferedComPortService(TEST_CONFIG);
      await this.comService.initSerialPort();

      this.log("✅ COM port connected successfully!");
      this.log(
        `📡 Port: ${TEST_CONFIG.path}, Baud Rate: ${TEST_CONFIG.baudRate}`
      );

      return true;
    } catch (error) {
      this.log(`❌ Connection failed: ${error.message}`, "ERROR");

      // Provide troubleshooting suggestions
      if (error.message.includes("Access denied")) {
        this.log("💡 Access Denied Solutions:", "WARN");
        this.log("   - Run this script as Administrator", "WARN");
        this.log(
          "   - Close Arduino IDE, PuTTY, or other COM port applications",
          "WARN"
        );
        this.log(
          "   - Check if another Node.js process is using the port",
          "WARN"
        );
      } else if (error.message.includes("File not found")) {
        this.log("💡 Port Not Found Solutions:", "WARN");
        this.log("   - Check if USB device is connected", "WARN");
        this.log("   - Verify COM3 exists in Device Manager", "WARN");
        this.log("   - Try a different COM port", "WARN");
      }

      throw error;
    }
  }

  async testDataListening() {
    this.log("\n🎧 Test 2: Data Listening");
    this.log("-".repeat(40));

    if (!this.comService) {
      throw new Error("COM service not initialized");
    }

    return new Promise((resolve) => {
      let dataReceived = false;
      let testComplete = false;

      // Set up data listener
      const dataHandler = (data) => {
        if (!testComplete) {
          dataReceived = true;
          this.log(`📥 Data received: "${data}"`);
          this.log("✅ Data listening test passed!");
          this.comService.off("dataGot", dataHandler);
          testComplete = true;
          resolve(true);
        }
      };

      this.comService.on("dataGot", dataHandler);
      this.log("👂 Listening for data on COM port...");
      this.log(
        "💡 To test: Send data from scanner or type in a terminal program"
      );
      this.log("⏰ Timeout: 15 seconds");

      // 15 second timeout
      setTimeout(() => {
        if (!testComplete) {
          this.comService.off("dataGot", dataHandler);
          testComplete = true;

          if (dataReceived) {
            this.log("✅ Data was received during test period");
            resolve(true);
          } else {
            this.log("⚠️ No data received during test period", "WARN");
            this.log("💡 This could mean:", "WARN");
            this.log("   - Scanner is not sending data automatically", "WARN");
            this.log("   - Scanner needs manual trigger", "WARN");
            this.log("   - Wrong baud rate configuration", "WARN");
            this.log("   - Scanner is not connected properly", "WARN");
            resolve(false);
          }
        }
      }, 15000);
    });
  }

  async testManualInput() {
    this.log("\n⌨️ Test 3: Manual Input Test");
    this.log("-".repeat(40));
    this.log("💡 Instructions:");
    this.log("   1. If you have a barcode scanner, scan a barcode now");
    this.log("   2. If testing with terminal software, send some text");
    this.log("   3. Press Ctrl+C to skip this test");
    this.log("⏰ Waiting 30 seconds for manual input...");

    return new Promise((resolve) => {
      let inputReceived = false;
      let testComplete = false;

      const manualInputHandler = (data) => {
        if (!testComplete) {
          inputReceived = true;
          this.log(`📥 Manual input received: "${data}"`);
          this.log("✅ Manual input test passed!");
          this.comService.off("dataGot", manualInputHandler);
          testComplete = true;
          resolve(true);
        }
      };

      this.comService.on("dataGot", manualInputHandler);

      // 30 second timeout for manual testing
      setTimeout(() => {
        if (!testComplete) {
          this.comService.off("dataGot", manualInputHandler);
          testComplete = true;

          if (inputReceived) {
            resolve(true);
          } else {
            this.log("⏰ No manual input received", "WARN");
            resolve(false);
          }
        }
      }, 30000);
    });
  }

  async cleanup() {
    this.log("\n🧹 Cleanup");
    this.log("-".repeat(40));

    if (this.comService) {
      try {
        await this.comService.closePort();
        this.log("✅ COM port closed successfully");
      } catch (error) {
        this.log(`⚠️ Error closing port: ${error.message}`, "WARN");
      }
    }
  }

  printSummary() {
    this.log("\n📊 Test Summary");
    this.log("=".repeat(60));

    const errors = this.testResults.filter((r) => r.type === "ERROR");
    const warnings = this.testResults.filter((r) => r.type === "WARN");

    this.log(`Total log entries: ${this.testResults.length}`);
    this.log(`Errors: ${errors.length}`);
    this.log(`Warnings: ${warnings.length}`);

    if (errors.length === 0) {
      this.log("🎉 All tests completed without errors!");
    } else {
      this.log(
        "❌ Some tests had errors. Check the log above for details.",
        "ERROR"
      );
    }
  }
}

// Enhanced error handling for standalone execution
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log("\n👋 Test interrupted by user");
  process.exit(0);
});

// Main execution
async function main() {
  const tester = new ComPortTester();
  await tester.runAllTests();
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ Test execution failed:", error.message);
    process.exit(1);
  });
}

export default ComPortTester;
