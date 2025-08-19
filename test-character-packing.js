// Test script to verify character packing logic
import logger from "./logger.js";

function testCharacterPacking() {
  logger.info("🧪 Testing Character Packing Logic");
  logger.info("=" .repeat(50));
  
  const testData = "A19H25A009"; // The actual data from the logs
  logger.info(`📝 Test data: "${testData}"`);
  
  const CHARS_PER_REGISTER = 2;
  const numRegisters = Math.ceil(testData.length / CHARS_PER_REGISTER);
  logger.info(`🔢 Number of registers needed: ${numRegisters}`);
  
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
    } else if (chunk.length === 1) {
      // Single character: just use its ASCII value
      registerValue = chunk.charCodeAt(0);
    }
    
    logger.info(`📝 Register ${3000 + i}: "${chunk}" → ${registerValue} (0x${registerValue.toString(16).toUpperCase()})`);
    
    // Verify the value is within 16-bit range
    if (registerValue >= 0 && registerValue <= 65535) {
      logger.success(`✅ Register ${3000 + i} value ${registerValue} is within valid range (0-65535)`);
    } else {
      logger.error(`❌ Register ${3000 + i} value ${registerValue} is OUT OF RANGE!`);
    }
  }
  
  logger.success("\n🎉 Character packing test completed!");
}

// Run the test
testCharacterPacking();
