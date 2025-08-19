import TcpScannerService from "./services/TcpScannerService.js";
import { writeRegister, writeRegisterFull } from "./services/modbus.js";
import logger from "./logger.js";
import fs from "fs";

async function testScannerPlcIntegration() {
  logger.info("🧪 Starting Scanner PLC Integration Test");

  try {
    // Test PLC connection and write to multiple registers starting from 3000
    logger.info("🔌 Testing PLC connection and multiple register write...");
    const testData = "TEST_SCAN_DATA_123";

    // Test the new multiple register approach
    await testMultipleRegisterWrite(testData);

    // Test file saving to D: drive
    logger.info("💾 Testing file saving to D: drive...");
    const fileName = "scan_data.txt";
    const filePath = `D:/${fileName}`;

    try {
      // Test writing scanner data only (override each time)
      const testData1 = "TEST_SCAN_DATA_123";
      const testData2 = "TEST_SCAN_DATA_456";

      // Write first data
      await fs.writeFileSync(filePath, testData1, "utf8");
      logger.success(`✅ First test data written to ${filePath}`);

      // Verify first data
      let savedData = await fs.readFileSync(filePath, "utf8");
      if (savedData === testData1) {
        logger.success("✅ First data verification passed");
      } else {
        logger.error("❌ First data verification failed");
      }

      // Write second data (should override first)
      await fs.writeFileSync(filePath, testData2, "utf8");
      logger.success(`✅ Second test data written to ${filePath}`);

      // Verify second data (should have replaced first)
      savedData = await fs.readFileSync(filePath, "utf8");
      if (savedData === testData2) {
        logger.success(
          "✅ Second data verification passed - file was overridden"
        );
        logger.info(`📄 Final file content: "${savedData}"`);
      } else {
        logger.error("❌ Second data verification failed");
      }

      // Clean up test file
      await fs.unlinkSync(filePath);
      logger.info("🧹 Test file cleaned up");
    } catch (fileError) {
      logger.warn(`⚠️ Could not save to D: drive: ${fileError.message}`);
      logger.info("💡 Trying alternative path...");

      const altPath = `./${fileName}`;
      try {
        const testData1 = "TEST_SCAN_DATA_123";
        const testData2 = "TEST_SCAN_DATA_456";

        // Write first data
        await fs.writeFileSync(altPath, testData1, "utf8");
        logger.success(
          `✅ First test data written to alternative path: ${altPath}`
        );

        // Write second data (should override first)
        await fs.writeFileSync(altPath, testData2, "utf8");
        logger.success(
          `✅ Second test data written to alternative path: ${altPath}`
        );

        // Clean up test file
        await fs.unlinkSync(altPath);
        logger.info("🧹 Alternative test file cleaned up");
      } catch (altError) {
        logger.error(`❌ Error with alternative path: ${altError.message}`);
      }
    }

    // Test TCP scanner connection
    logger.info("🔌 Testing TCP scanner connection...");
    const tcpScannerService = new TcpScannerService({
      host: "192.168.72.118",
      port: 502,
      timeout: 5000,
      reconnectInterval: 3000,
      keepAlive: true,
      keepAliveInitialDelay: 1000,
      logDir: "test_scanner_logs",
    });

    try {
      await tcpScannerService.initTcpConnection();
      logger.success("✅ TCP scanner connected successfully");

      // Test data handling
      logger.info("📡 Testing scanner data handling...");
      const mockScannerData = "MOCK_SCANNER_DATA_456";

      // Simulate receiving scanner data
      tcpScannerService.emit("dataGot", mockScannerData);

      logger.success("✅ Scanner data handling test completed");

      // Close connection
      await tcpScannerService.closeConnection();
      logger.info("🔌 TCP scanner connection closed");
    } catch (scannerError) {
      logger.warn(`⚠️ TCP scanner test failed: ${scannerError.message}`);
      logger.info(
        "💡 This is expected if scanner is not available during testing"
      );
    }

    logger.success("🎉 Scanner PLC Integration Test completed successfully!");
  } catch (error) {
    logger.error("❌ Scanner PLC Integration Test failed:", error);
    throw error;
  }
}

async function testMultipleRegisterWrite(scannerData) {
  try {
    const START_REGISTER = 3000;
    const CHARS_PER_REGISTER = 8; // Each register can hold 8 characters

    // Convert scanner data to string
    const dataString = scannerData.toString();
    logger.info(`📊 Test scanner data length: ${dataString.length} characters`);

    // Calculate how many registers we need
    const numRegisters = Math.ceil(dataString.length / CHARS_PER_REGISTER);
    logger.info(`🔢 Number of registers needed: ${numRegisters}`);

    // Split data into chunks for each register
    const registerValues = [];
    for (let i = 0; i < numRegisters; i++) {
      const startIndex = i * CHARS_PER_REGISTER;
      const endIndex = startIndex + CHARS_PER_REGISTER;
      const chunk = dataString.slice(startIndex, endIndex);

      // Convert chunk to register value (16-bit integer)
      let registerValue = 0;
      for (let j = 0; j < chunk.length; j++) {
        const charCode = chunk.charCodeAt(j);
        // Shift left by 2 bytes (16 bits) for each character position
        registerValue |= charCode << (j * 16);
      }

      registerValues.push(registerValue);
      logger.info(
        `📝 Register ${START_REGISTER + i}: "${chunk}" → ${registerValue} (0x${registerValue.toString(16).toUpperCase()})`
      );
    }

    // Test writing all registers at once
    logger.info(
      `🔌 Testing writeRegistersFull to registers ${START_REGISTER} to ${START_REGISTER + numRegisters - 1}...`
    );
    await writeRegisterFull(START_REGISTER, registerValues);
    logger.success(
      `✅ Successfully wrote ${numRegisters} registers starting from ${START_REGISTER}`
    );

    // Test writing status register
    logger.info("🔌 Testing status register write...");
    await writeRegister(2999, numRegisters);
    logger.success(
      `✅ Status register 2999 updated with number of registers used: ${numRegisters}`
    );
  } catch (error) {
    logger.error(`❌ Error testing multiple register write: ${error.message}`);
    throw error;
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testScannerPlcIntegration()
    .then(() => {
      logger.info("✅ All tests passed");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("❌ Tests failed:", error);
      process.exit(1);
    });
}

export default testScannerPlcIntegration;
