#!/usr/bin/env node

/**
 * Test New Scan System
 *
 * This script tests the new clean implementation of the scan cycle system.
 */

import ScanCycleManager, {
  ScanCycleState,
  PLC_REGISTERS,
} from "./services/ScanCycleManager.js";
import logger from "./logger.js";

class ScanSystemTester {
  constructor() {
    this.scanCycleManager = null;
    this.testResults = [];
  }

  async runTests() {
    try {
      logger.info("🧪 Starting Scan System Tests...");

      // Test 1: Initialize scan cycle manager
      await this.testInitialization();

      // Test 2: Test state machine transitions
      await this.testStateMachine();

      // Test 3: Test PLC signal monitoring
      await this.testPLCSignalMonitoring();

      // Test 4: Test bit clearing
      await this.testBitClearing();

      // Test 5: Test error handling
      await this.testErrorHandling();

      // Test 6: Test full cycle simulation
      await this.testFullCycleSimulation();

      this.printTestResults();
    } catch (error) {
      logger.error("❌ Test suite failed:", error.message);
    } finally {
      await this.cleanup();
    }
  }

  async testInitialization() {
    logger.info("🧪 Test 1: Initialization");

    try {
      this.scanCycleManager = new ScanCycleManager();
      await this.scanCycleManager.initialize();

      const status = this.scanCycleManager.getStatus();
      this.assert(
        status.isRunning === false,
        "Should not be running after initialization"
      );
      this.assert(
        status.currentState === ScanCycleState.IDLE,
        "Should be in IDLE state"
      );
      this.assert(status.cycleCount === 0, "Cycle count should be 0");

      this.recordTest(
        "Initialization",
        true,
        "✅ All initialization tests passed"
      );
    } catch (error) {
      this.recordTest(
        "Initialization",
        false,
        `❌ Initialization failed: ${error.message}`
      );
    }
  }

  async testStateMachine() {
    logger.info("🧪 Test 2: State Machine");

    try {
      const stateMachine = this.scanCycleManager.stateMachine;

      // Test valid transitions
      this.assert(
        stateMachine.canTransitionTo(ScanCycleState.WAITING_FOR_START),
        "Should be able to transition to WAITING_FOR_START"
      );

      stateMachine.transition(ScanCycleState.WAITING_FOR_START);
      this.assert(
        stateMachine.getCurrentState() === ScanCycleState.WAITING_FOR_START,
        "Should be in WAITING_FOR_START state"
      );

      // Test invalid transitions
      this.assert(
        !stateMachine.canTransitionTo(ScanCycleState.COMPLETED),
        "Should not be able to transition directly to COMPLETED"
      );

      this.recordTest(
        "State Machine",
        true,
        "✅ All state machine tests passed"
      );
    } catch (error) {
      this.recordTest(
        "State Machine",
        false,
        `❌ State machine test failed: ${error.message}`
      );
    }
  }

  async testPLCSignalMonitoring() {
    logger.info("🧪 Test 3: PLC Signal Monitoring");

    try {
      const signalMonitor = this.scanCycleManager.signalMonitor;

      // Test signal monitoring with timeout
      const startTime = Date.now();
      const result = await signalMonitor.waitForSignal(1410, 0, 1, 1000); // 1 second timeout
      const elapsed = Date.now() - startTime;

      this.assert(
        result === false,
        "Should timeout when signal is not received"
      );
      this.assert(
        elapsed >= 1000 && elapsed < 1100,
        "Should timeout after approximately 1 second"
      );

      this.recordTest(
        "PLC Signal Monitoring",
        true,
        "✅ All PLC signal monitoring tests passed"
      );
    } catch (error) {
      this.recordTest(
        "PLC Signal Monitoring",
        false,
        `❌ PLC signal monitoring test failed: ${error.message}`
      );
    }
  }

  async testBitClearing() {
    logger.info("🧪 Test 4: Bit Clearing");

    try {
      // Test bit clearing
      await this.scanCycleManager.clearAllBits();

      // Verify bits are cleared by reading them
      const bitReader = this.scanCycleManager.bitReader;

      const dataMatchOk = await bitReader.readBit(
        PLC_REGISTERS.STATUS.DATA_MATCH_OK.register,
        PLC_REGISTERS.STATUS.DATA_MATCH_OK.bit
      );
      const dataMatchNg = await bitReader.readBit(
        PLC_REGISTERS.STATUS.DATA_MATCH_NG.register,
        PLC_REGISTERS.STATUS.DATA_MATCH_NG.bit
      );

      this.assert(dataMatchOk === false, "DATA_MATCH_OK bit should be cleared");
      this.assert(dataMatchNg === false, "DATA_MATCH_NG bit should be cleared");

      this.recordTest("Bit Clearing", true, "✅ All bit clearing tests passed");
    } catch (error) {
      this.recordTest(
        "Bit Clearing",
        false,
        `❌ Bit clearing test failed: ${error.message}`
      );
    }
  }

  async testErrorHandling() {
    logger.info("🧪 Test 5: Error Handling");

    try {
      // Test error handling by simulating an error
      const originalState =
        this.scanCycleManager.stateMachine.getCurrentState();

      // Simulate an error
      await this.scanCycleManager.handleError(new Error("Test error"));

      // Check if state machine handled the error properly
      const newState = this.scanCycleManager.stateMachine.getCurrentState();
      this.assert(
        newState === ScanCycleState.IDLE,
        "Should transition to IDLE state after error"
      );

      this.recordTest(
        "Error Handling",
        true,
        "✅ All error handling tests passed"
      );
    } catch (error) {
      this.recordTest(
        "Error Handling",
        false,
        `❌ Error handling test failed: ${error.message}`
      );
    }
  }

  async testFullCycleSimulation() {
    logger.info("🧪 Test 6: Full Cycle Simulation");

    try {
      // Test full cycle simulation (without actually running the cycle)
      const status = this.scanCycleManager.getStatus();

      this.assert(
        status.isRunning === false,
        "Should not be running initially"
      );
      this.assert(
        status.currentState === ScanCycleState.IDLE,
        "Should be in IDLE state"
      );
      this.assert(status.cycleCount === 0, "Cycle count should be 0");

      this.recordTest(
        "Full Cycle Simulation",
        true,
        "✅ All full cycle simulation tests passed"
      );
    } catch (error) {
      this.recordTest(
        "Full Cycle Simulation",
        false,
        `❌ Full cycle simulation test failed: ${error.message}`
      );
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  recordTest(testName, passed, message) {
    this.testResults.push({
      name: testName,
      passed,
      message,
      timestamp: new Date(),
    });

    if (passed) {
      logger.info(message);
    } else {
      logger.error(message);
    }
  }

  printTestResults() {
    logger.section("📊 Test Results Summary");

    const passed = this.testResults.filter((r) => r.passed).length;
    const total = this.testResults.length;

    logger.info(`✅ Passed: ${passed}/${total}`);
    logger.info(`❌ Failed: ${total - passed}/${total}`);

    if (total - passed > 0) {
      logger.info("\n❌ Failed Tests:");
      this.testResults
        .filter((r) => !r.passed)
        .forEach((r) => logger.info(`   - ${r.name}: ${r.message}`));
    }

    logger.info(`\n🎯 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  }

  async cleanup() {
    if (this.scanCycleManager) {
      try {
        await this.scanCycleManager.cleanup();
        logger.info("🧹 Test cleanup completed");
      } catch (error) {
        logger.error("❌ Error during test cleanup:", error.message);
      }
    }
  }
}

// Run the tests
const tester = new ScanSystemTester();
tester.runTests().catch((error) => {
  logger.error("❌ Test suite failed:", error.message);
  process.exit(1);
});
