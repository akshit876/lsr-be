#!/usr/bin/env node

/**
 * Fresh RS-232 Scanner Data Reading Test
 *
 * Simple script to test reading data from RS-232 scanner
 * Fixed to match Hercules configuration exactly
 */

import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import process from "process";

console.log("🔍 RS-232 Scanner Data Reading Test");
console.log("====================================");
console.log("🎯 Since Hercules works, let's match its exact configuration!");

class ScannerReader {
  constructor() {
    this.port = null;
    this.parser = null;
    this.dataReceived = false;
  }

  async connect() {
    try {
      console.log("📡 Connecting to COM3 at 115200 baud...");
      console.log("🔧 Using EXACT Hercules settings:");
      console.log("   - Baud: 115200");
      console.log("   - Data bits: 8");
      console.log("   - Parity: None");
      console.log("   - Stop bits: 1");
      console.log("   - Flow control: None");

      this.port = new SerialPort({
        path: "COM3",
        baudRate: 115200,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        flowControl: false,
        // Additional settings to match Hercules exactly
        rtscts: false,
        xon: false,
        xoff: false,
        xany: false,
      });

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
    console.log("🔧 Testing multiple data detection methods:");

    // Method 1: Raw data (like Hercules)
    this.port.on("data", (buffer) => {
      this.dataReceived = true;
      const data = buffer.toString();
      console.log("📥 ✅ RAW DATA RECEIVED (Method 1):");
      console.log(`    Raw: "${data}"`);
      console.log(`    Length: ${data.length} characters`);
      console.log(`    Bytes: ${buffer.length}`);
      console.log(`    Hex: ${buffer.toString("hex")}`);
      console.log(`    ASCII codes: ${Array.from(buffer).join(", ")}`);
    });

    // Method 2: Line parser with different delimiters
    const parsers = [
      {
        name: "CRLF Parser",
        parser: new ReadlineParser({ delimiter: "\r\n" }),
      },
      { name: "CR Parser", parser: new ReadlineParser({ delimiter: "\r" }) },
      { name: "LF Parser", parser: new ReadlineParser({ delimiter: "\n" }) },
    ];

    parsers.forEach((p, index) => {
      const parser = this.port.pipe(p.parser);
      parser.on("data", (data) => {
        this.dataReceived = true;
        console.log(
          `📥 ✅ ${p.name.toUpperCase()} DATA (Method ${index + 2}):`
        );
        console.log(`    Parsed: "${data}"`);
        console.log(`    Length: ${data.length} characters`);
      });
    });

    this.port.on("error", (err) => {
      console.error("❌ Port error:", err.message);
    });
  }

  async justListen(seconds = 20) {
    console.log(`\n👂 Pure listening test (${seconds} seconds)...`);
    console.log("🎯 This matches exactly what Hercules does!");
    console.log("💡 Try scanning a barcode now...");
    console.log("");

    return new Promise((resolve) => {
      let countdown = seconds;

      const countdownInterval = setInterval(() => {
        if (countdown > 0) {
          process.stdout.write(`\r⏰ ${countdown} seconds remaining...`);
          countdown--;
        }
      }, 1000);

      const timeout = setTimeout(() => {
        clearInterval(countdownInterval);
        console.log("\n⏰ Timeout - no data received");
        resolve(this.dataReceived);
      }, seconds * 1000);

      // If data is received, resolve immediately
      const dataHandler = () => {
        clearInterval(countdownInterval);
        clearTimeout(timeout);
        console.log("\n🎉 SUCCESS! Data received!");
        resolve(true);
      };

      this.port.once("data", dataHandler);
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
      // Step 1: Connect with exact Hercules settings
      await this.connect();

      // Step 2: Setup comprehensive data listener
      this.setupDataListener();

      // Step 3: Pure listening (like Hercules)
      console.log("\n📋 HERCULES-STYLE TEST: Pure Data Listening");
      console.log("=".repeat(50));
      const result = await this.justListen(20);

      if (result) {
        console.log("🎉 SUCCESS! Scanner data received!");
        console.log("✅ The scanner communication is working properly.");
      } else {
        console.log("❌ Still no data received...");
        console.log("🤔 Possible reasons:");
        console.log("   1. Scanner sends data only once after power-on");
        console.log("   2. Scanner needs specific wake-up sequence");
        console.log("   3. Scanner has internal buffer that's full");
        console.log("   4. Scanner requires DTR/RTS signal control");

        console.log("\n💡 Try this:");
        console.log("   1. Disconnect scanner USB cable");
        console.log("   2. Reconnect scanner USB cable");
        console.log("   3. Run this test again immediately");
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
  console.log("🔍 DEBUG INFO:");
  console.log("   - Hercules: WORKS ✅");
  console.log("   - Our program: Testing...");
  console.log("");

  const reader = new ScannerReader();
  await reader.runFullTest();

  console.log("\n🎉 Test completed!");
}

main().catch(console.error);
