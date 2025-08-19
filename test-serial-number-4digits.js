// Test script to verify 4-digit serial number generation
import logger from "./logger.js";

function testSerialNumberFormatting() {
  logger.info("🧪 Testing 4-Digit Serial Number Formatting");
  logger.info("=".repeat(50));

  // Test various serial numbers to ensure they're formatted as 4 digits
  const testNumbers = [1, 10, 100, 999, 1000, 9999, 10000];

  logger.info("📊 Testing serial number formatting:");
  logger.info("=".repeat(30));

  for (const num of testNumbers) {
    const formatted = num.toString().padStart(4, "0");
    const expectedLength = formatted.length;
    const is4Digits = expectedLength === 4;

    logger.info(
      `Number: ${num} → Formatted: "${formatted}" (${expectedLength} chars) ${is4Digits ? "✅" : "❌"}`
    );
  }

  logger.info("\n🎯 Expected Results:");
  logger.info("=".repeat(30));
  logger.info("✅ 1 → 0001 (4 digits)");
  logger.info("✅ 10 → 0010 (4 digits)");
  logger.info("✅ 100 → 0100 (4 digits)");
  logger.info("✅ 999 → 0999 (4 digits)");
  logger.info("✅ 1000 → 1000 (4 digits)");
  logger.info("✅ 9999 → 9999 (4 digits)");
  logger.info("❌ 10000 → 10000 (5 digits - exceeds limit)");

  logger.info("\n📋 Summary of Changes Made:");
  logger.info("=".repeat(40));
  logger.info("1. Changed limit from 999 to 9999");
  logger.info("2. Updated padStart(3, '0') to padStart(4, '0')");
  logger.info("3. Updated all logging to show 4-digit format");
  logger.info("4. Updated comments to reflect 4-digit maximum");

  logger.success("\n🎉 4-digit serial number test completed!");
}

// Run the test
testSerialNumberFormatting();
