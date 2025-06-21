import ShiftUtility from "./services/ShiftUtility.js";
import logger from "./logger.js";

async function testShiftConfiguration() {
  logger.info("🧪 Testing Shift Configuration");

  // Create shift utility with default configuration
  const shiftUtil = new ShiftUtility();

  logger.info("📋 Current Default Shift Configuration:");
  logger.info(
    `   A Shift: ${shiftUtil.shiftConfig.A.start} - ${shiftUtil.shiftConfig.A.end}`
  );
  logger.info(
    `   B Shift: ${shiftUtil.shiftConfig.B.start} - ${shiftUtil.shiftConfig.B.end}`
  );
  logger.info(
    `   C Shift: ${shiftUtil.shiftConfig.C.start} - ${shiftUtil.shiftConfig.C.end}`
  );

  // Test different times
  const testTimes = [
    { time: "06:00", description: "6:00 AM" },
    { time: "11:00", description: "11:00 AM" },
    { time: "14:30", description: "2:30 PM" },
    { time: "16:00", description: "4:00 PM" },
    { time: "23:00", description: "11:00 PM" },
    { time: "02:00", description: "2:00 AM" },
  ];

  logger.info("🕐 Testing Shift Detection:");
  testTimes.forEach(({ time, description }) => {
    const testDate = new Date();
    const [hours, minutes] = time.split(":").map(Number);
    testDate.setHours(hours, minutes, 0, 0);

    const shift = shiftUtil.getCurrentShift(testDate);
    logger.info(`   ${description} (${time}) → ${shift} Shift`);
  });

  // Show what the configuration should be for 11:00 AM to be B Shift
  logger.info("💡 To make 11:00 AM B Shift, the configuration should be:");
  logger.info("   A Shift: 06:00 - 11:00 (6:00 AM to 11:00 AM)");
  logger.info("   B Shift: 11:00 - 18:00 (11:00 AM to 6:00 PM)");
  logger.info("   C Shift: 18:00 - 06:00 (6:00 PM to 6:00 AM)");

  // Test with corrected configuration
  logger.info("🔄 Testing with Corrected Configuration:");
  const correctedConfig = {
    A: { start: "06:00", end: "11:00" },
    B: { start: "11:00", end: "18:00" },
    C: { start: "18:00", end: "06:00" },
  };

  const correctedShiftUtil = new ShiftUtility(correctedConfig);

  testTimes.forEach(({ time, description }) => {
    const testDate = new Date();
    const [hours, minutes] = time.split(":").map(Number);
    testDate.setHours(hours, minutes, 0, 0);

    const shift = correctedShiftUtil.getCurrentShift(testDate);
    logger.info(`   ${description} (${time}) → ${shift} Shift`);
  });
}

// Run the test
testShiftConfiguration().catch((error) => {
  logger.error("❌ Error testing shift configuration:", error);
});
