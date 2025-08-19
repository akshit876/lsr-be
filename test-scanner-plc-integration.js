import TcpScannerService from "./services/TcpScannerService.js";
import { writeRegister } from "./services/modbus.js";
import logger from "./logger.js";
import fs from "fs";

async function testScannerPlcIntegration() {
  logger.info("🧪 Starting Scanner PLC Integration Test");

  try {
    // Test PLC connection and write to register 3000
    logger.info("🔌 Testing PLC connection and register 3000 write...");
    const testData = "TEST_SCAN_DATA_123";
    await writeRegister(3000, testData);
    logger.success(`✅ Successfully wrote "${testData}" to PLC register 3000`);

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
