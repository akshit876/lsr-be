import { io } from "socket.io-client";
import logger from "./logger.js";

// Test configuration
const SERVER_URL = "http://localhost:3002";
const TEST_DELAY = 1000; // 1 second delay between tests

class SocketEventTester {
  constructor() {
    this.socket = null;
    this.testResults = [];
    this.currentTest = 0;
  }

  async connect() {
    try {
      logger.info("🔌 Connecting to server...");
      this.socket = io(SERVER_URL);

      return new Promise((resolve, reject) => {
        this.socket.on("connect", () => {
          logger.success(`✅ Connected to server with ID: ${this.socket.id}`);
          this.setupEventListeners();
          resolve();
        });

        this.socket.on("connect_error", (error) => {
          logger.error(`❌ Connection failed: ${error.message}`);
          reject(error);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 10000);
      });
    } catch (error) {
      logger.error("Failed to create socket connection:", error);
      throw error;
    }
  }

  setupEventListeners() {
    // Success event listeners
    this.socket.on("scanner_trigger_success", (data) => {
      logger.success(`✅ Scanner trigger success: ${JSON.stringify(data)}`);
      this.recordTestResult("scanner_trigger", true, data);
    });

    this.socket.on("mark_on_success", (data) => {
      logger.success(`✅ Mark on success: ${JSON.stringify(data)}`);
      this.recordTestResult("mark_on", true, data);
    });

    this.socket.on("light_on_success", (data) => {
      logger.success(`✅ Light on success: ${JSON.stringify(data)}`);
      this.recordTestResult("light_on", true, data);
    });

    this.socket.on("manualRunSuccess", (data) => {
      logger.success(`✅ Manual run success: ${JSON.stringify(data)}`);
      this.recordTestResult("manual_run", true, data);
    });

    this.socket.on("servo-setting-change-response", (data) => {
      logger.success(
        `✅ Servo setting change success: ${JSON.stringify(data)}`
      );
      this.recordTestResult("servo_setting_change", true, data);
    });

    this.socket.on("jobControlSuccess", (data) => {
      logger.success(`✅ Job control success: ${JSON.stringify(data)}`);
      this.recordTestResult("job_control", true, data);
    });

    this.socket.on("plcBitOperationSuccess", (data) => {
      logger.success(`✅ PLC bit operation success: ${JSON.stringify(data)}`);
      this.recordTestResult("plc_bit_operation", true, data);
    });

    this.socket.on("plcRegisterOperationSuccess", (data) => {
      logger.success(
        `✅ PLC register operation success: ${JSON.stringify(data)}`
      );
      this.recordTestResult("plc_register_operation", true, data);
    });

    this.socket.on("event-service-status", (data) => {
      logger.success(`✅ Event service status: ${JSON.stringify(data)}`);
      this.recordTestResult("get_event_service_status", true, data);
    });

    // Error event listener
    this.socket.on("error", (error) => {
      logger.error(`❌ Socket error: ${JSON.stringify(error)}`);
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
    logger.section("🧪 Starting Socket Event Tests");

    const tests = [
      {
        name: "Get Event Service Status",
        execute: () => this.socket.emit("get-event-service-status"),
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
        logger.info(`🧪 Running test: ${test.name}`);
        test.execute();

        // Wait for response
        await this.wait(test.delay);

        logger.info(`✅ Test completed: ${test.name}`);
      } catch (error) {
        logger.error(`❌ Test failed: ${test.name}`, error);
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
    logger.section("📊 Test Results Summary");

    const totalTests = this.testResults.length;
    const successfulTests = this.testResults.filter((r) => r.success).length;
    const failedTests = totalTests - successfulTests;

    logger.info(`Total Tests: ${totalTests}`);
    logger.info(`Successful: ${successfulTests}`);
    logger.info(`Failed: ${failedTests}`);

    if (failedTests > 0) {
      logger.warn("Failed Tests:");
      this.testResults
        .filter((r) => !r.success)
        .forEach((result) => {
          logger.warn(`  - ${result.test}: ${JSON.stringify(result.data)}`);
        });
    }

    logger.info("Successful Tests:");
    this.testResults
      .filter((r) => r.success)
      .forEach((result) => {
        logger.info(`  ✅ ${result.test}`);
      });
  }

  disconnect() {
    if (this.socket) {
      logger.info("🔌 Disconnecting from server...");
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Main execution
async function main() {
  const tester = new SocketEventTester();

  try {
    await tester.connect();
    await tester.runTests();
  } catch (error) {
    logger.error("Test execution failed:", error);
  } finally {
    tester.disconnect();
    logger.info("🏁 Testing completed");
    process.exit(0);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
  });
}

export default SocketEventTester;
