import {
  connect,
  readRegister,
  writeRegister,
  readBit,
  writeBit,
  readBits,
  writeBits,
} from "./services/modbus.js";
import process from "process";

class ModbusTest {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log("🚀 Starting Modbus Tests...\n");

    try {
      // Connect to Modbus
      await this.testConnection();

      // Test register operations
      await this.testRegisterOperations();

      // Test bit operations
      await this.testBitOperations();

      // Test multiple bits
      await this.testMultipleBits();

      // Test writeBit function specifically
      await this.testWriteBitFunction();

      // Show results
      this.showResults();
    } catch (error) {
      console.error("❌ Test suite failed:", error);
    }
  }

  async testConnection() {
    try {
      console.log("📡 Testing Modbus Connection...");
      await connect();
      this.logTest(
        "Connection",
        true,
        "Successfully connected to Modbus device"
      );
    } catch (error) {
      this.logTest("Connection", false, `Failed to connect: ${error.message}`);
      throw error;
    }
  }

  async testRegisterOperations() {
    console.log("\n📊 Testing Register Operations...");

    // Test reading a register
    try {
      console.log("  • Reading register 1410...");
      const data = await readRegister(1410, 1);
      this.logTest("Read Register 1410", true, `Value: ${data[0]}`);
    } catch (error) {
      this.logTest("Read Register 1410", false, error.message);
    }

    // Test reading multiple registers
    try {
      console.log("  • Reading registers 1410-1415 (6 registers)...");
      const data = await readRegister(1410, 6);
      this.logTest(
        "Read Multiple Registers",
        true,
        `Values: [${data.join(", ")}]`
      );
    } catch (error) {
      this.logTest("Read Multiple Registers", false, error.message);
    }

    // Test writing to a register (using a safe test register)
    try {
      console.log("  • Writing value 100 to register 550...");
      await writeRegister(550, 100);

      // Verify the write
      const verifyData = await readRegister(550, 1);
      if (verifyData[0] === 100) {
        this.logTest(
          "Write Register 550",
          true,
          `Written and verified: ${verifyData[0]}`
        );
      } else {
        this.logTest(
          "Write Register 550",
          false,
          `Written 100 but read ${verifyData[0]}`
        );
      }
    } catch (error) {
      this.logTest("Write Register 550", false, error.message);
    }
  }

  async testBitOperations() {
    console.log("\n🔧 Testing Bit Operations...");

    // Test reading a bit
    try {
      console.log("  • Reading bit 1410.0...");
      const bitValue = await readBit(1410, 0);
      this.logTest("Read Bit 1410.0", true, `Value: ${bitValue}`);
    } catch (error) {
      this.logTest("Read Bit 1410.0", false, error.message);
    }

    // Test reading multiple bits from same register
    try {
      console.log("  • Reading bits 1410.0-3...");
      const bitValue0 = await readBit(1410, 0);
      const bitValue1 = await readBit(1410, 1);
      const bitValue2 = await readBit(1410, 2);
      const bitValue3 = await readBit(1410, 3);
      this.logTest(
        "Read Multiple Bits 1410",
        true,
        `Bits 0-3: [${bitValue0}, ${bitValue1}, ${bitValue2}, ${bitValue3}]`
      );
    } catch (error) {
      this.logTest("Read Multiple Bits 1410", false, error.message);
    }

    // Test writing a bit (using a safe test register)
    try {
      console.log("  • Writing bit 1414.15 = 1...");
      await writeBit(1414, 15, 1);

      // Verify the write
      const verifyBit = await readBit(1414, 15);
      if (verifyBit === 1 || verifyBit === true) {
        this.logTest(
          "Write Bit 1414.15",
          true,
          `Written and verified: ${verifyBit}`
        );

        // Reset the bit
        console.log("  • Resetting bit 1414.15 = 0...");
        await writeBit(1414, 15, 0);
        const resetVerify = await readBit(1414, 15);
        this.logTest(
          "Reset Bit 1414.15",
          resetVerify === 0 || resetVerify === false,
          `Reset verified: ${resetVerify}`
        );
      } else {
        this.logTest(
          "Write Bit 1414.15",
          false,
          `Written 1 but read ${verifyBit}`
        );
      }
    } catch (error) {
      this.logTest("Write Bit 1414.15", false, error.message);
    }
  }

  async testWriteBitFunction() {
    console.log("\n⭐ Testing writeBit Function Specifically...");

    // Test writeBit with different values and registers
    const testCases = [
      { register: 1414, bit: 10, value: 1, description: "Set bit 1414.10 = 1" },
      { register: 1414, bit: 11, value: 0, description: "Set bit 1414.11 = 0" },
      {
        register: 1414,
        bit: 9,
        value: true,
        description: "Set bit 1414.9 = true",
      },
      {
        register: 1414,
        bit: 8,
        value: false,
        description: "Set bit 1414.8 = false",
      },
    ];

    for (const testCase of testCases) {
      try {
        console.log(`  • ${testCase.description}...`);

        // Use writeBit function
        await writeBit(testCase.register, testCase.bit, testCase.value);

        // Verify the write
        const verifyValue = await readBit(testCase.register, testCase.bit);
        const expectedValue = testCase.value === 1 || testCase.value === true;
        const actualValue = verifyValue === 1 || verifyValue === true;

        if (expectedValue === actualValue) {
          this.logTest(
            `writeBit ${testCase.register}.${testCase.bit}`,
            true,
            `Successfully wrote ${testCase.value}, verified: ${verifyValue}`
          );
        } else {
          this.logTest(
            `writeBit ${testCase.register}.${testCase.bit}`,
            false,
            `Wrote ${testCase.value} but read ${verifyValue}`
          );
        }

        // Clean up - reset bit to 0
        await writeBit(testCase.register, testCase.bit, 0);
      } catch (error) {
        this.logTest(
          `writeBit ${testCase.register}.${testCase.bit}`,
          false,
          error.message
        );
      }
    }

    // Test rapid bit toggling using writeBit
    try {
      console.log("  • Testing rapid bit toggling with writeBit...");
      const toggleRegister = 1414;
      const toggleBit = 7;

      for (let i = 0; i < 5; i++) {
        await writeBit(toggleRegister, toggleBit, 1);
        await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms delay
        await writeBit(toggleRegister, toggleBit, 0);
        await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms delay
      }

      // Verify final state is 0
      const finalState = await readBit(toggleRegister, toggleBit);
      this.logTest(
        "writeBit Rapid Toggle",
        finalState === 0 || finalState === false,
        `Rapid toggle completed, final state: ${finalState}`
      );
    } catch (error) {
      this.logTest("writeBit Rapid Toggle", false, error.message);
    }
  }

  async testMultipleBits() {
    console.log("\n🔢 Testing Multiple Bits Operations...");

    // Test reading multiple bits at once
    try {
      console.log("  • Reading multiple bits from register 1410...");
      const bits = await readBits(1410, [0, 1, 2, 3]);
      this.logTest(
        "Read Multiple Bits Array",
        true,
        `Bits [0,1,2,3]: [${Object.values(bits).join(", ")}]`
      );
    } catch (error) {
      this.logTest("Read Multiple Bits Array", false, error.message);
    }

    // Test writing multiple bits using writeBit function
    try {
      console.log("  • Testing individual writeBit calls for multiple bits...");
      const targetRegister = 1414;
      const testBits = [
        { bit: 12, value: 1 },
        { bit: 13, value: 0 },
        { bit: 14, value: 1 },
      ];

      // Use writeBit for each bit individually
      for (const { bit, value } of testBits) {
        await writeBit(targetRegister, bit, value);
      }

      // Verify the writes
      const verifyBits = await readBits(targetRegister, [12, 13, 14]);
      const success =
        verifyBits[12] === 1 && verifyBits[13] === 0 && verifyBits[14] === 1;
      this.logTest(
        "Individual writeBit Calls",
        success,
        `Written individually {12:1, 13:0, 14:1}, Read: {12:${verifyBits[12]}, 13:${verifyBits[13]}, 14:${verifyBits[14]}}`
      );

      // Clean up using writeBit
      await writeBit(targetRegister, 12, 0);
      await writeBit(targetRegister, 13, 0);
      await writeBit(targetRegister, 14, 0);
    } catch (error) {
      this.logTest("Individual writeBit Calls", false, error.message);
    }

    // Test writing multiple bits using writeBits function
    try {
      console.log("  • Testing writeBits function for comparison...");
      const testBits = { 12: 1, 13: 0, 14: 1 };
      await writeBits(1414, testBits);

      // Verify the writes
      const verifyBits = await readBits(1414, [12, 13, 14]);
      const success =
        verifyBits[12] === 1 && verifyBits[13] === 0 && verifyBits[14] === 1;
      this.logTest(
        "writeBits Function",
        success,
        `Written with writeBits {12:1, 13:0, 14:1}, Read: {12:${verifyBits[12]}, 13:${verifyBits[13]}, 14:${verifyBits[14]}}`
      );

      // Clean up - reset all bits to 0
      await writeBits(1414, { 12: 0, 13: 0, 14: 0 });
    } catch (error) {
      this.logTest("writeBits Function", false, error.message);
    }
  }

  logTest(testName, success, details) {
    const result = {
      name: testName,
      success,
      details,
      timestamp: new Date().toISOString(),
    };
    this.testResults.push(result);

    const status = success ? "✅" : "❌";
    console.log(`  ${status} ${testName}: ${details}`);
  }

  showResults() {
    console.log("\n📋 Test Results Summary:");
    console.log("=".repeat(50));

    const passed = this.testResults.filter((r) => r.success).length;
    const total = this.testResults.length;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    console.log("\nDetailed Results:");
    this.testResults.forEach((result, index) => {
      const status = result.success ? "✅" : "❌";
      console.log(`${index + 1}. ${status} ${result.name}`);
      if (!result.success) {
        console.log(`   Error: ${result.details}`);
      }
    });
  }
}

// CLI usage
async function main() {
  const tester = new ModbusTest();

  try {
    await tester.runAllTests();
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

// Export for use as module
export default ModbusTest;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
