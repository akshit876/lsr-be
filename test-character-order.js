// Test script to verify correct character order in PLC registers
import logger from "./logger.js";

function testCharacterOrder() {
  logger.info("🧪 Testing Character Order in PLC Registers");
  logger.info("=".repeat(50));

  const testData = "A19H25A009"; // The actual data from the logs
  logger.info(`📝 Test data: "${testData}"`);

  const CHARS_PER_REGISTER = 2;
  const numRegisters = Math.ceil(testData.length / CHARS_PER_REGISTER);
  logger.info(`🔢 Number of registers needed: ${numRegisters}`);

  logger.info("\n📊 Character Order Analysis:");
  logger.info("=".repeat(50));

  for (let i = 0; i < numRegisters; i++) {
    const startIndex = i * CHARS_PER_REGISTER;
    const endIndex = startIndex + CHARS_PER_REGISTER;
    const chunk = testData.slice(startIndex, endIndex);

    // Convert chunk to register value (16-bit integer)
    let registerValue = 0;
    if (chunk.length === 2) {
      // Two characters: pack them into 16 bits
      const char1 = chunk.charCodeAt(0);
      const char2 = chunk.charCodeAt(1);
      registerValue = (char1 << 8) | char2;

      logger.info(`📝 Register ${3000 + i}: "${chunk}"`);
      logger.info(
        `   - char1: "${chunk[0]}" (ASCII: ${char1}, Hex: 0x${char1.toString(16).toUpperCase()})`
      );
      logger.info(
        `   - char2: "${chunk[1]}" (ASCII: ${char2}, Hex: 0x${char2.toString(16).toUpperCase()})`
      );
      logger.info(
        `   - Packed: (${char1} << 8) | ${char2} = ${registerValue} (0x${registerValue.toString(16).toUpperCase()})`
      );
      logger.info(
        `   - Binary: ${registerValue.toString(2).padStart(16, "0")}`
      );
      logger.info(
        `   - High byte: ${(registerValue >> 8) & 0xff} (0x${((registerValue >> 8) & 0xff).toString(16).toUpperCase()})`
      );
      logger.info(
        `   - Low byte: ${registerValue & 0xff} (0x${(registerValue & 0xff).toString(16).toUpperCase()})`
      );
      logger.info("");
    } else if (chunk.length === 1) {
      // Single character: just use its ASCII value
      registerValue = chunk.charCodeAt(0);
      logger.info(`📝 Register ${3000 + i}: "${chunk}"`);
      logger.info(
        `   - Single char: "${chunk[0]}" (ASCII: ${registerValue}, Hex: 0x${registerValue.toString(16).toUpperCase()})`
      );
      logger.info(
        `   - Binary: ${registerValue.toString(2).padStart(16, "0")}`
      );
      logger.info("");
    }
  }

  logger.info("🎯 Expected PLC Reading Order:");
  logger.info("=".repeat(50));
  logger.info("When PLC reads these registers, it should see:");
  logger.info(
    "Register 3000: High byte = 'A' (65), Low byte = '1' (49) → Should read as 'A1'"
  );
  logger.info(
    "Register 3001: High byte = '9' (57), Low byte = 'H' (72) → Should read as '9H'"
  );
  logger.info(
    "Register 3002: High byte = '2' (50), Low byte = '5' (53) → Should read as '25'"
  );
  logger.info(
    "Register 3003: High byte = 'A' (65), Low byte = '0' (48) → Should read as 'A0'"
  );
  logger.info(
    "Register 3004: High byte = '0' (48), Low byte = '9' (57) → Should read as '09'"
  );

  logger.success("\n🎉 Character order test completed!");
}

// Run the test
testCharacterOrder();
