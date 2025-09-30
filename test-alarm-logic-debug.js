#!/usr/bin/env node

/**
 * Debug script to test alarm logic with different bit values
 */

import logger from "./logger.js";

function testAlarmLogic() {
  logger.info("🧪 Testing Alarm Logic with Different Bit Values");
  logger.info("=".repeat(50));

  // Test different register values
  const testValues = [
    { value: 0, description: "All bits OFF" },
    { value: 1, description: "Bit 0 ON (part not present)" },
    { value: 2, description: "Bit 1 ON (emergency stop)" },
    { value: 4, description: "Bit 2 ON (safety sensor)" },
    { value: 3, description: "Bit 0+1 ON" },
    { value: 7, description: "All bits ON" },
  ];

  testValues.forEach(({ value, description }) => {
    logger.info(`\n📊 Testing: ${description} (Value: ${value})`);

    // Extract bits (current logic)
    const bit0 = (value >> 0) & 1;
    const bit1 = (value >> 1) & 1;
    const bit2 = (value >> 2) & 1;

    logger.info(`   Bit 0 (Part Present): ${bit0}`);
    logger.info(`   Bit 1 (Emergency Stop): ${bit1}`);
    logger.info(`   Bit 2 (Safety Sensor): ${bit2}`);

    // Current alarm logic
    const activeAlarms = [];
    if (bit0) activeAlarms.push("part_not_present");
    if (bit1) activeAlarms.push("emergency_stop");
    if (bit2) activeAlarms.push("safety_sensor");

    logger.info(`   Active Alarms: [${activeAlarms.join(", ")}]`);

    // Expected behavior
    let expected = [];
    if (value & 1) expected.push("part_not_present");
    if (value & 2) expected.push("emergency_stop");
    if (value & 4) expected.push("safety_sensor");

    logger.info(`   Expected: [${expected.join(", ")}]`);

    const correct = JSON.stringify(activeAlarms) === JSON.stringify(expected);
    logger.info(`   Result: ${correct ? "✅ CORRECT" : "❌ WRONG"}`);
  });

  logger.info("\n" + "=".repeat(50));
  logger.info("🔍 Analysis Complete");
}

testAlarmLogic();
