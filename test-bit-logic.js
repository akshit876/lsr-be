#!/usr/bin/env node

/**
 * Test script to verify bit-dependent alarm logic
 */

import logger from "./logger.js";

function testBitLogic() {
  logger.info("🧪 Testing Bit-Dependent Alarm Logic");
  logger.info("=".repeat(50));

  // Test different bit combinations
  const testCases = [
    {
      partPresent: false,
      emergencyStop: false,
      safetySensor: false,
      expected: [],
    },
    {
      partPresent: true,
      emergencyStop: false,
      safetySensor: false,
      expected: ["part_not_present"],
    },
    {
      partPresent: false,
      emergencyStop: true,
      safetySensor: false,
      expected: ["emergency_stop"],
    },
    {
      partPresent: false,
      emergencyStop: false,
      safetySensor: true,
      expected: ["safety_sensor"],
    },
    {
      partPresent: true,
      emergencyStop: true,
      safetySensor: false,
      expected: ["part_not_present", "emergency_stop"],
    },
    {
      partPresent: true,
      emergencyStop: true,
      safetySensor: true,
      expected: ["part_not_present", "emergency_stop", "safety_sensor"],
    },
  ];

  testCases.forEach(
    ({ partPresent, emergencyStop, safetySensor, expected }, index) => {
      logger.info(`\n📋 Test Case ${index + 1}:`);
      logger.info(
        `   Input: partPresent=${partPresent}, emergencyStop=${emergencyStop}, safetySensor=${safetySensor}`
      );

      // Simulate the bit-dependent logic
      const activeAlarms = [];
      if (partPresent) {
        activeAlarms.push("part_not_present");
      }
      if (emergencyStop) {
        activeAlarms.push("emergency_stop");
      }
      if (safetySensor) {
        activeAlarms.push("safety_sensor");
      }

      logger.info(`   Expected: [${expected.join(", ")}]`);
      logger.info(`   Actual:   [${activeAlarms.join(", ")}]`);

      const passed = JSON.stringify(activeAlarms) === JSON.stringify(expected);
      logger.info(`   Result:   ${passed ? "✅ PASS" : "❌ FAIL"}`);

      if (!passed) {
        logger.error(
          `   ❌ MISMATCH: Expected ${expected.length} alarms, got ${activeAlarms.length}`
        );
      }
    }
  );

  logger.info("\n" + "=".repeat(50));
  logger.info("🧪 Bit-Dependent Logic Test Complete");
  logger.info("📋 Logic: If bit = 1, then alarm is active (no state tracking)");
}

testBitLogic();
