import { connect, writeRegister, readRegister } from "./services/modbus.js";
import logger from "./logger.js";

// Quick Modbus connection test
async function quickModbusTest() {
  logger.section("🔌 Quick Modbus Test");

  try {
    // Test register (safe address range)
    const testRegister = 1000;
    const testValue = 12345;

    logger.info("🔌 Connecting to Modbus...");
    await connect();
    logger.info("✅ Connected successfully");

    logger.info(`📝 Writing ${testValue} to register ${testRegister}...`);
    await writeRegister(testRegister, testValue);
    logger.info("✅ Write successful");

    logger.info(`📖 Reading register ${testRegister}...`);
    const [readValue] = await readRegister(testRegister, 1);
    logger.info(`✅ Read successful: ${readValue}`);

    if (readValue === testValue) {
      logger.success("🎉 Test passed! Write and read values match.");
    } else {
      logger.error(`❌ Test failed! Written: ${testValue}, Read: ${readValue}`);
    }

    // Cleanup
    logger.info("🧹 Cleaning up...");
    await writeRegister(testRegister, 0);
    logger.info("✅ Cleanup completed");
  } catch (error) {
    logger.error("❌ Test failed:", error.message);
    process.exit(1);
  }
}

// Run the test
quickModbusTest().catch((error) => {
  logger.error("💥 Fatal error:", error);
  process.exit(1);
});
