#!/usr/bin/env node

/**
 * Fresh RS-232 Scanner Data Reading Test
 *
 * Simple script to test reading data from RS-232 scanner
 */

import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

console.log("🔍 RS-232 Scanner Data Reading Test");
console.log("====================================");

class ScannerReader {
  constructor() {
    this.port = null;
    this.parser = null;
    this.dataReceived = false;
  }

  async connect() {
    try {
      console.log("📡 Connecting to COM3 at 115200 baud...");

      this.port = new SerialPort({
        path: "COM3",
        baudRate: 115200,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        flowControl: false,
      });

      // Set up parser for line-based data
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

      await new Promise((resolve, reject) => {
        this.port.on("open", () => {
          console.log("✅ COM3 connected successfully!");
          resolve();
        });

        this.port.on("error", (err) => {
          console.error("❌ Connection error:", err.message);
          reject(err);
        });
      });

      return true;
    } catch (error) {
      console.error("❌ Failed to connect:", error.message);

      if (error.message.includes("Access denied")) {
        console.log("💡 Solution: Run as Administrator");
      } else if (error.message.includes("File not found")) {
        console.log("💡 Solution: Check if scanner is connected to COM3");
      }

      throw error;
    }
  }

  setupDataListener() {
    console.log("👂 Setting up data listener...");

    // Listen for complete lines
    this.parser.on("data", (data) => {
      this.dataReceived = true;
      console.log("📥 ✅ SCANNER DATA RECEIVED:");
      console.log(`    "${data}"`);
      console.log(`    Length: ${data.length} characters`);
      console.log(`    Hex: ${Buffer.from(data).toString("hex")}`);
    });

    // Listen for any raw data (even partial)
    this.port.on("data", (buffer) => {
      const data = buffer.toString();
      console.log(`📥 Raw data: "${data}" (${buffer.length} bytes)`);
    });

    this.port.on("error", (err) => {
      console.error("❌ Port error:", err.message);
    });
  }

  async sendTriggerCommands() {
    console.log("\n🔫 Testing Trigger Commands...");
    console.log("-".repeat(40));

    const triggers = [
      { name: "Carriage Return", data: "\r" },
      { name: "Line Feed", data: "\n" },
      { name: "CRLF", data: "\r\n" },
      { name: "SCAN Command", data: "SCAN\r" },
      { name: "TRIGGER Command", data: "TRIGGER\r" },
      { name: "READ Command", data: "READ\r" },
      { name: "SYN Character", data: String.fromCharCode(0x16) },
      { name: "T Character", data: "T" },
    ];

    for (const trigger of triggers) {
      console.log(`\n🔫 Sending: ${trigger.name}`);

      try {
        this.port.write(trigger.data);
        console.log("📤 Trigger sent, waiting 2 seconds...");

        // Wait 2 seconds for response
        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (this.dataReceived) {
          console.log("🎉 SUCCESS! This trigger works!");
          return trigger;
        } else {
          console.log("⚠️ No response to this trigger");
        }

        // Reset flag for next test
        this.dataReceived = false;
      } catch (error) {
        console.error(`❌ Error sending ${trigger.name}:`, error.message);
      }
    }

    console.log("❌ No working trigger found");
    return null;
  }

  async listenForData(seconds = 30) {
    console.log(`\n👂 Listening for data for ${seconds} seconds...`);
    console.log("💡 Try these now:");
    console.log("   1. Press scanner trigger button (if it has one)");
    console.log("   2. Scan a barcode");
    console.log("   3. Point scanner at any barcode and pull trigger");
    console.log("");

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!this.dataReceived) {
          console.log("⏰ Timeout - no data received");
        }
        resolve(this.dataReceived);
      }, seconds * 1000);

      // If data is received, resolve immediately
      const dataHandler = () => {
        clearTimeout(timeout);
        resolve(true);
      };

      this.parser.once("data", dataHandler);
    });
  }

  async close() {
    if (this.port && this.port.isOpen) {
      await new Promise((resolve) => {
        this.port.close(() => {
          console.log("✅ COM3 closed");
          resolve();
        });
      });
    }
  }

  async runFullTest() {
    try {
      // Step 1: Connect
      await this.connect();

      // Step 2: Setup listener
      this.setupDataListener();

      // Step 3: Listen for manual scanning
      console.log("\n📋 TEST 1: Manual Scanning");
      console.log("=".repeat(30));
      const manualResult = await this.listenForData(15);

      if (manualResult) {
        console.log("🎉 Manual scanning works! Scanner is properly connected.");
        return;
      }

      // Step 4: Try trigger commands
      console.log("\n📋 TEST 2: Automatic Triggers");
      console.log("=".repeat(30));
      const workingTrigger = await this.sendTriggerCommands();

      if (workingTrigger) {
        console.log(`\n🎯 Working configuration found:`);
        console.log(`   - COM Port: COM3`);
        console.log(`   - Baud Rate: 115200`);
        console.log(`   - Trigger: ${workingTrigger.name}`);
      } else {
        console.log("\n❌ Scanner Configuration Issues:");
        console.log("   1. Scanner may not be powered on");
        console.log("   2. Scanner may need different configuration");
        console.log("   3. Scanner may require manual trigger only");
        console.log("   4. Check scanner manual for RS-232 setup");
      }
    } catch (error) {
      console.error("❌ Test failed:", error.message);
    } finally {
      await this.close();
    }
  }
}

// Handle Ctrl+C
process.on("SIGINT", async () => {
  console.log("\n👋 Test interrupted by user");
  process.exit(0);
});

// Main execution
async function main() {
  const reader = new ScannerReader();
  await reader.runFullTest();

  console.log("\n🎉 Test completed!");
}

main().catch(console.error);
