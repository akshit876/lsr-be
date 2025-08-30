#!/usr/bin/env node

import { io } from "socket.io-client";

// Test configuration
const SOCKET_URL = process.env.SOCKET_URL || "http://localhost:3003";
const TEST_DELAY = 1000; // 1 second delay between tests

class SocketTester {
  constructor() {
    this.socket = null;
    this.testResults = [];
  }

  async connect() {
    try {
      console.log("🔌 Connecting to socket microservice...");
      this.socket = io(SOCKET_URL);

      return new Promise((resolve, reject) => {
        this.socket.on("connect", () => {
          console.log(
            `✅ Connected to socket microservice with ID: ${this.socket.id}`
          );
          this.setupEventListeners();
          resolve();
        });

        this.socket.on("connect_error", (error) => {
          console.error(`❌ Connection failed: ${error.message}`);
          reject(error);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 10000);
      });
    } catch (error) {
      console.error("Failed to create socket connection:", error);
      throw error;
    }
  }

  setupEventListeners() {
    // Success event listeners
    this.socket.on("scanner_trigger_success", (data) => {
      console.log(`✅ Scanner trigger success:`, data);
      this.recordTestResult("scanner_trigger", true, data);
    });

    this.socket.on("mark_on_success", (data) => {
      console.log(`✅ Mark on success:`, data);
      this.recordTestResult("mark_on", true, data);
    });

    this.socket.on("light_on_success", (data) => {
      console.log(`✅ Light on success:`, data);
      this.recordTestResult("light_on", true, data);
    });

    this.socket.on("manualRunSuccess", (data) => {
      console.log(`✅ Manual run success:`, data);
      this.recordTestResult("manual_run", true, data);
    });

    this.socket.on("servo-setting-change-response", (data) => {
      console.log(`✅ Servo setting change success:`, data);
      this.recordTestResult("servo_setting_change", true, data);
    });

    this.socket.on("jobControlSuccess", (data) => {
      console.log(`✅ Job control success:`, data);
      this.recordTestResult("job_control", true, data);
    });

    this.socket.on("plcBitOperationSuccess", (data) => {
      console.log(`✅ PLC bit operation success:`, data);
      this.recordTestResult("plc_bit_operation", true, data);
    });

    this.socket.on("plcRegisterOperationSuccess", (data) => {
      console.log(`✅ PLC register operation success:`, data);
      this.recordTestResult("plc_register_operation", true, data);
    });

    this.socket.on("event-service-status", (data) => {
      console.log(`✅ Event service status:`, data);
      this.recordTestResult("get_event_service_status", true, data);
    });

    this.socket.on("health-check-response", (data) => {
      console.log(`✅ Health check response:`, data);
      this.recordTestResult("health_check", true, data);
    });

    // Error event listener
    this.socket.on("error", (error) => {
      console.error(`❌ Socket error:`, error);
      this.recordTestResult("error", false, error);
    });
  }

  recordTestResult(testName, success, data) {
    this.testResults.push({
      test: testName,
      success,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  async runTests() {
    console.log("🧪 Starting Socket Event Tests");

    const tests = [
      {
        name: "Get Event Service Status",
        execute: () => this.socket.emit("get-event-service-status"),
        delay: 500,
      },
      {
        name: "Health Check",
        execute: () => this.socket.emit("health-check"),
        delay: 500,
      },
      {
        name: "Scanner Trigger",
        execute: () => this.socket.emit("scanner_trigger"),
        delay: TEST_DELAY,
      },
      {
        name: "Mark On",
        execute: () => this.socket.emit("mark_on"),
        delay: TEST_DELAY,
      },
      {
        name: "Light On",
        execute: () => this.socket.emit("light_on"),
        delay: TEST_DELAY,
      },
      {
        name: "Manual Run - Marking Start",
        execute: () => this.socket.emit("manual-run", "markingStart"),
        delay: TEST_DELAY,
      },
      {
        name: "Servo Setting Change - Home Position",
        execute: () =>
          this.socket.emit("servo-setting-change", {
            setting: "homePosition",
            value: { position: 100.5 },
          }),
        delay: TEST_DELAY,
      },
      {
        name: "Job Control - Production Pause",
        execute: () =>
          this.socket.emit("job-control", {
            jobType: "production",
            action: "pause",
          }),
        delay: TEST_DELAY,
      },
      {
        name: "PLC Bit Operation - Custom",
        execute: () =>
          this.socket.emit("plc-bit-operation", {
            address: 1500,
            bit: 5,
            value: 1,
            operation: "test_operation",
          }),
        delay: TEST_DELAY,
      },
      {
        name: "PLC Register Operation - Custom",
        execute: () =>
          this.socket.emit("plc-register-operation", {
            address: 1600,
            value: 12345,
            operation: "test_register_operation",
          }),
        delay: TEST_DELAY,
      },
    ];

    for (const test of tests) {
      try {
        console.log(`🧪 Running test: ${test.name}`);
        test.execute();

        // Wait for response
        await this.wait(test.delay);

        console.log(`✅ Test completed: ${test.name}`);
      } catch (error) {
        console.error(`❌ Test failed: ${test.name}`, error);
        this.recordTestResult(test.name, false, error);
      }
    }

    // Wait a bit more for any delayed responses
    await this.wait(2000);

    this.printTestResults();
  }

  async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  printTestResults() {
    console.log("\n📊 Test Results Summary");

    const totalTests = this.testResults.length;
    const successfulTests = this.testResults.filter((r) => r.success).length;
    const failedTests = totalTests - successfulTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Successful: ${successfulTests}`);
    console.log(`Failed: ${failedTests}`);

    if (failedTests > 0) {
      console.log("\nFailed Tests:");
      this.testResults
        .filter((r) => !r.success)
        .forEach((result) => {
          console.log(`  ❌ ${result.test}: ${JSON.stringify(result.data)}`);
        });
    }

    console.log("\nSuccessful Tests:");
    this.testResults
      .filter((r) => r.success)
      .forEach((result) => {
        console.log(`  ✅ ${result.test}`);
      });
  }

  disconnect() {
    if (this.socket) {
      console.log("🔌 Disconnecting from socket microservice...");
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Main execution
async function main() {
  const tester = new SocketTester();

  try {
    await tester.connect();
    await tester.runTests();
  } catch (error) {
    console.error("Test execution failed:", error);
  } finally {
    tester.disconnect();
    console.log("🏁 Testing completed");
    process.exit(0);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export default SocketTester;
