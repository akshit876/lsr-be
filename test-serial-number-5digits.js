// Test script to verify 5-digit serial number formatting
import logger from "./logger.js";

const SERIAL_DIGITS = 5;

function testSerialNumberFormatting() {
  logger.info("🧪 Testing 5-Digit Serial Number Formatting");
  logger.info("=".repeat(50));

  const testNumbers = [1, 10, 100, 999, 1000, 9999, 99999, 100000];

  logger.info("📊 Testing serial number formatting:");
  logger.info("=".repeat(30));

  for (const num of testNumbers) {
    const formatted = num.toString().padStart(SERIAL_DIGITS, "0");
    const expectedLength = formatted.length;
    const is5Digits = expectedLength === SERIAL_DIGITS;

    logger.info(
      `Number: ${num} → Formatted: "${formatted}" (${expectedLength} chars) ${is5Digits ? "✅" : "❌"}`
    );
  }

  logger.info("\n🎯 Expected Results:");
  logger.info("=".repeat(30));
  logger.info("✅ 1 → 00001 (5 digits)");
  logger.info("✅ 10 → 00010 (5 digits)");
  logger.info("✅ 99999 → 99999 (5 digits)");
  logger.info("❌ 100000 → 6 chars when padded (exceeds 5-digit display cap)");

  logger.success("\n🎉 5-digit serial number test completed!");
}

testSerialNumberFormatting();
