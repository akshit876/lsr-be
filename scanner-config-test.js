#!/usr/bin/env node

/**
 * RS-232 Scanner Configuration Test
 *
 * This script tests different configurations and trigger methods
 * for RS-232 barcode scanners
 */

import BufferedComPortService from "./services/ComPortService.js";
import process from "process";

console.log("🔍 RS-232 Scanner Configuration Test");
console.log("=====================================");

// Common baud rates for barcode scanners - 115200 first since it works
const BAUD_RATES = [115200, 9600, 19200, 38400, 57600, 4800];

// Common trigger commands for RS-232 scanners
const TRIGGER_COMMANDS = [
  "\r", // Carriage return
  "\n", // Line feed
  "\r\n", // CRLF
  "SCAN\r", // SCAN command
  "TRIGGER\r", // TRIGGER command
  "READ\r", // READ command
  String.fromCharCode(0x16), // SYN character (some Honeywell scanners)
  String.fromCharCode(0x54), // 'T' trigger (some Symbol scanners)
];

class ScannerConfigTester {
  constructor() {
    this.comService = null;
  }

  async testAllBaudRates() {
    console.log("🚀 Testing Different Baud Rates...");
    console.log("-".repeat(50));

    for (const baudRate of BAUD_RATES) {
      console.log(`\n📡 Testing baud rate: ${baudRate}`);

      try {
        // Create new service for each baud rate
        this.comService = new BufferedComPortService({
          path: "COM3",
          baudRate: baudRate,
          logDir: "scanner_test_logs",
        });

        await this.comService.initSerialPort();
        console.log(`✅ Connected at ${baudRate} baud`);

        // Listen for data
        const dataReceived = await this.listenForData(3); // 3 second test

        if (dataReceived) {
          console.log(`🎉 SUCCESS! Scanner responds at ${baudRate} baud`);
          await this.comService.closePort();
          return baudRate;
        }

        await this.comService.closePort();
        console.log(`⚠️ No data at ${baudRate} baud`);
      } catch (error) {
        console.log(`❌ Failed at ${baudRate} baud: ${error.message}`);
        if (this.comService) {
          try {
            await this.comService.closePort();
          } catch (e) {
            console.log(`Warning: Error closing port: ${e.message}`);
          }
        }
      }
    }

    console.log("❌ No working baud rate found");
    return null;
  }

  async testTriggerCommands(baudRate = 115200) {
    console.log("\n🎯 Testing Scanner Trigger Commands...");
    console.log("-".repeat(50));

    try {
      this.comService = new BufferedComPortService({
        path: "COM3",
        baudRate: baudRate,
        logDir: "scanner_test_logs",
      });

      await this.comService.initSerialPort();
      console.log(`📡 Connected at ${baudRate} baud for trigger testing`);

      for (const command of TRIGGER_COMMANDS) {
        console.log(
          `\n🔫 Testing trigger command: "${command.replace("\r", "\\r").replace("\n", "\\n")}"`
        );

        // Send trigger command
        this.comService.port.write(command);
        console.log("📤 Trigger command sent");

        // Listen for response
        const dataReceived = await this.listenForData(2);

        if (dataReceived) {
          console.log(`🎉 SUCCESS! Scanner responds to this trigger command!`);
          await this.comService.closePort();
          return command;
        }

        console.log("⚠️ No response to this trigger");
      }

      await this.comService.closePort();
      console.log("❌ No working trigger command found");
      return null;
    } catch (error) {
      console.log(`❌ Error testing triggers: ${error.message}`);
      if (this.comService) {
        try {
          await this.comService.closePort();
        } catch (e) {
          console.log(`Warning: Error closing port: ${e.message}`);
        }
      }
      return null;
    }
  }

  async listenForData(timeoutSeconds = 3) {
    return new Promise((resolve) => {
      let testComplete = false;

      const dataHandler = (data) => {
        if (!testComplete) {
          console.log(`📥 Data received: "${data}"`);
          console.log(`📊 Data length: ${data.length} characters`);
          this.comService.off("dataGot", dataHandler);
          testComplete = true;
          resolve(true);
        }
      };

      this.comService.on("dataGot", dataHandler);

      setTimeout(() => {
        if (!testComplete) {
          this.comService.off("dataGot", dataHandler);
          testComplete = true;
          resolve(false);
        }
      }, timeoutSeconds * 1000);
    });
  }

  async runFullTest() {
    console.log("🏁 Starting Full Scanner Configuration Test");
    console.log("=".repeat(60));

    try {
      // Test 1: Find working baud rate
      const workingBaudRate = await this.testAllBaudRates();

      if (!workingBaudRate) {
        console.log("\n❌ Could not establish communication with scanner");
        console.log("💡 Troubleshooting suggestions:");
        console.log("   1. Check scanner power and connection");
        console.log("   2. Try manual trigger (scan button) during next test");
        console.log("   3. Check scanner manual for correct settings");
        return;
      }

      // Test 2: Test trigger commands
      const workingTrigger = await this.testTriggerCommands(workingBaudRate);

      // Final summary
      console.log("\n📋 TEST RESULTS");
      console.log("=".repeat(40));
      console.log(`✅ Working baud rate: ${workingBaudRate}`);

      if (workingTrigger) {
        console.log(
          `✅ Working trigger: "${workingTrigger.replace("\r", "\\r").replace("\n", "\\n")}"`
        );
        console.log("\n🎯 Configuration for your application:");
        console.log(`   - Baud Rate: ${workingBaudRate}`);
        console.log(
          `   - Trigger Command: "${workingTrigger.replace("\r", "\\r").replace("\n", "\\n")}"`
        );
      } else {
        console.log(
          "⚠️ No automatic trigger found - scanner may need manual trigger"
        );
      }
    } catch (error) {
      console.error("❌ Test failed:", error.message);
    }
  }
}

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log("\n👋 Test interrupted by user");
  process.exit(0);
});

// Main execution
async function main() {
  const tester = new ScannerConfigTester();

  console.log("💡 IMPORTANT: During this test:");
  console.log("   1. Have a barcode ready to scan");
  console.log("   2. Try pressing scanner trigger button when prompted");
  console.log("   3. Some scanners auto-trigger, others need manual trigger");
  console.log("\n⏰ Starting in 3 seconds...\n");

  await new Promise((resolve) => setTimeout(resolve, 3000));

  await tester.runFullTest();
}

main().catch(console.error);
