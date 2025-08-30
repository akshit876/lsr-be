import {
  connect,
  writeRegister,
  readRegister,
  writeBit,
  readBit,
} from "./services/modbus.js";
import logger from "./logger.js";

class ModbusConnectionTester {
  constructor() {
    this.testResults = [];
    this.testRegister = 1000; // Test register address
    this.testBit = 0; // Test bit number
    this.testValue = 12345; // Test value to write
  }

  async runTests() {
    logger.section("🔌 Modbus Connection Test");

    try {
      // Test 1: Basic connection
      logger.info("🧪 Test 1: Basic Modbus Connection");
      await this.testBasicConnection();

      // Test 2: Write and read register
      logger.info("🧪 Test 2: Write and Read Register");
      await this.testRegisterWriteRead();

      // Test 3: Write and read bit
      logger.info("🧪 Test 3: Write and Read Bit");
      await this.testBitWriteRead();

      // Test 4: Multiple register operations
      logger.info("🧪 Test 4: Multiple Register Operations");
      await this.testMultipleRegisters();

      this.printResults();
    } catch (error) {
      logger.error("❌ Modbus test failed:", error);
      throw error;
    }
  }

  async testBasicConnection() {
    try {
      logger.info("  🔌 Testing Modbus connection...");
      await connect();
      logger.info("  ✅ Modbus connection successful");

      this.recordTestResult("basic_connection", true, "Connection established");
      return true;
    } catch (error) {
      const message = `Connection failed: ${error.message}`;
      logger.error(`  ❌ ${message}`);
      this.recordTestResult("basic_connection", false, message);
      throw error;
    }
  }

  async testRegisterWriteRead() {
    try {
      logger.info(
        `  📝 Writing value ${this.testValue} to register ${this.testRegister}...`
      );

      // Write to register
      await writeRegister(this.testRegister, this.testValue);
      logger.info(
        `  ✅ Write successful: register ${this.testRegister} = ${this.testValue}`
      );

      // Read back the register
      logger.info(`  📖 Reading register ${this.testRegister}...`);
      const [readValue] = await readRegister(this.testRegister, 1);
      logger.info(
        `  ✅ Read successful: register ${this.testRegister} = ${readValue}`
      );

      // Verify the value
      if (readValue === this.testValue) {
        logger.info(
          `  ✅ Verification successful: written ${this.testValue}, read ${readValue}`
        );
        this.recordTestResult("register_write_read", true, {
          written: this.testValue,
          read: readValue,
          register: this.testRegister,
        });
      } else {
        const message = `Value mismatch: written ${this.testValue}, read ${readValue}`;
        logger.error(`  ❌ ${message}`);
        this.recordTestResult("register_write_read", false, message);
        throw new Error(message);
      }

      return true;
    } catch (error) {
      const message = `Register test failed: ${error.message}`;
      logger.error(`  ❌ ${message}`);
      this.recordTestResult("register_write_read", false, message);
      throw error;
    }
  }

  async testBitWriteRead() {
    try {
      logger.info(
        `  📝 Writing bit ${this.testBit} to register ${this.testRegister}...`
      );

      // Write bit to 1
      await writeBit(this.testRegister, this.testBit, 1);
      logger.info(
        `  ✅ Bit write successful: register ${this.testRegister}, bit ${this.testBit} = 1`
      );

      // Read back the bit
      logger.info(
        `  📖 Reading bit ${this.testBit} from register ${this.testRegister}...`
      );
      const readBitValue = await readBit(this.testRegister, this.testBit);
      logger.info(
        `  ✅ Bit read successful: register ${this.testRegister}, bit ${this.testBit} = ${readBitValue}`
      );

      // Verify the bit value
      if (readBitValue === true) {
        logger.info(
          `  ✅ Bit verification successful: written 1, read ${readBitValue}`
        );

        // Now write bit to 0
        logger.info(
          `  📝 Writing bit ${this.testBit} to register ${this.testRegister} = 0...`
        );
        await writeBit(this.testRegister, this.testBit, 0);
        logger.info(
          `  ✅ Bit write successful: register ${this.testRegister}, bit ${this.testBit} = 0`
        );

        // Read back to verify
        const readBitValue2 = await readBit(this.testRegister, this.testBit);
        logger.info(
          `  📖 Reading bit ${this.testBit} from register ${this.testRegister}...`
        );
        logger.info(
          `  ✅ Bit read successful: register ${this.testRegister}, bit ${this.testBit} = ${readBitValue2}`
        );

        if (readBitValue2 === false) {
          logger.info(
            `  ✅ Bit verification successful: written 0, read ${readBitValue2}`
          );
          this.recordTestResult("bit_write_read", true, {
            bit1: { written: 1, read: readBitValue },
            bit0: { written: 0, read: readBitValue2 },
            register: this.testRegister,
            bit: this.testBit,
          });
        } else {
          const message = `Bit 0 verification failed: written 0, read ${readBitValue2}`;
          logger.error(`  ❌ ${message}`);
          this.recordTestResult("bit_write_read", false, message);
          throw new Error(message);
        }
      } else {
        const message = `Bit 1 verification failed: written 1, read ${readBitValue}`;
        logger.error(`  ❌ ${message}`);
        this.recordTestResult("bit_write_read", false, message);
        throw new Error(message);
      }

      return true;
    } catch (error) {
      const message = `Bit test failed: ${error.message}`;
      logger.error(`  ❌ ${message}`);
      this.recordTestResult("bit_write_read", false, message);
      throw error;
    }
  }

  async testMultipleRegisters() {
    try {
      const testRegisters = [
        { address: 1001, value: 1111 },
        { address: 1002, value: 2222 },
        { address: 1003, value: 3333 },
      ];

      logger.info("  📝 Writing to multiple registers...");

      // Write to multiple registers
      for (const reg of testRegisters) {
        await writeRegister(reg.address, reg.value);
        logger.info(`    ✅ Wrote ${reg.value} to register ${reg.address}`);
      }

      // Read back all registers
      logger.info("  📖 Reading multiple registers...");
      const startAddress = Math.min(...testRegisters.map((r) => r.address));
      const count =
        Math.max(...testRegisters.map((r) => r.address)) - startAddress + 1;

      const readValues = await readRegister(startAddress, count);
      logger.info(`  ✅ Read ${count} registers starting from ${startAddress}`);

      // Verify values
      let allCorrect = true;
      const verificationResults = [];

      for (const reg of testRegisters) {
        const readValue = readValues[reg.address - startAddress];
        const isCorrect = readValue === reg.value;

        if (isCorrect) {
          logger.info(
            `    ✅ Register ${reg.address}: written ${reg.value}, read ${readValue}`
          );
        } else {
          logger.error(
            `    ❌ Register ${reg.address}: written ${reg.value}, read ${readValue}`
          );
          allCorrect = false;
        }

        verificationResults.push({
          address: reg.address,
          written: reg.value,
          read: readValue,
          correct: isCorrect,
        });
      }

      if (allCorrect) {
        logger.info("  ✅ All multiple register operations successful");
        this.recordTestResult("multiple_registers", true, {
          registers: verificationResults,
          startAddress,
          count,
        });
      } else {
        const message = "Some register values don't match";
        logger.error(`  ❌ ${message}`);
        this.recordTestResult("multiple_registers", false, message);
        throw new Error(message);
      }

      return true;
    } catch (error) {
      const message = `Multiple registers test failed: ${error.message}`;
      logger.error(`  ❌ ${message}`);
      this.recordTestResult("multiple_registers", false, message);
      throw error;
    }
  }

  recordTestResult(testName, success, data) {
    this.testResults.push({
      test: testName,
      success,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  printResults() {
    logger.section("📊 Modbus Test Results");

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
          logger.warn(`  ❌ ${result.test}: ${result.data}`);
        });
    }

    logger.info("Successful Tests:");
    this.testResults
      .filter((r) => r.success)
      .forEach((result) => {
        logger.info(`  ✅ ${result.test}`);
      });

    if (failedTests === 0) {
      logger.success(
        "🎉 All Modbus tests passed! Connection is working properly."
      );
    } else {
      logger.error(
        "❌ Some Modbus tests failed. Check connection and configuration."
      );
    }
  }

  // Cleanup method to reset test registers
  async cleanup() {
    try {
      logger.info("🧹 Cleaning up test registers...");

      // Reset the main test register to 0
      await writeRegister(this.testRegister, 0);
      logger.info(`  ✅ Reset register ${this.testRegister} to 0`);

      // Reset multiple test registers
      const testRegisters = [1001, 1002, 1003];
      for (const address of testRegisters) {
        await writeRegister(address, 0);
        logger.info(`  ✅ Reset register ${address} to 0`);
      }

      logger.info("✅ Cleanup completed");
    } catch (error) {
      logger.warn("⚠️ Cleanup failed (non-critical):", error.message);
    }
  }
}

// Main execution
async function main() {
  const tester = new ModbusConnectionTester();

  try {
    await tester.runTests();

    // Ask user if they want to cleanup
    logger.info("\n🧹 Do you want to reset test registers to 0? (y/n)");

    // For automated testing, always cleanup
    await tester.cleanup();
  } catch (error) {
    logger.error("💥 Modbus test execution failed:", error);

    // Try to cleanup even on failure
    try {
      await tester.cleanup();
    } catch (cleanupError) {
      logger.warn("⚠️ Cleanup failed:", cleanupError.message);
    }

    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
  });
}

export default ModbusConnectionTester;
