import { readBit } from "./services/modbus.js";
import logger from "./logger.js";

async function testSafetyLogging() {
  logger.section("Testing Continuous Safety Logging");
  
  try {
    logger.info("🔍 Starting continuous safety monitoring...");
    logger.info("This will monitor safety bits every 100ms and log violations");
    logger.info("The system will NOT stop - just keep logging and monitoring");
    logger.info("Press Ctrl+C to stop the monitoring");
    
    let checkCount = 0;
    
    // Continuous monitoring loop
    const monitorInterval = setInterval(async () => {
      try {
        const [partPresent, emergencyStop, safetySensor] = await Promise.all([
          readBit(1490, 0), // Part present
          readBit(1490, 1), // Emergency stop
          readBit(1490, 2), // Safety sensor
        ]);
        
        checkCount++;
        
        // Log current status every 10 checks (1 second)
        if (checkCount % 10 === 0) {
          logger.info(`\n📊 Safety Status Check #${checkCount}:`);
          logger.info(`   - Part Present (1490.0): ${partPresent ? "✅ YES" : "❌ NO"}`);
          logger.info(`   - Emergency Stop (1490.1): ${emergencyStop ? "🚨 ACTIVE" : "✅ INACTIVE"}`);
          logger.info(`   - Safety Sensor (1490.2): ${safetySensor ? "✅ ENGAGED" : "❌ INTERRUPTED"}`);
        }
        
        // Log violations immediately when detected
        if (!partPresent) {
          logger.error("🚨 SAFETY VIOLATION: Part not present (1490.0 = 0)");
        }
        
        if (emergencyStop) {
          logger.error("🚨 SAFETY VIOLATION: Emergency stop activated (1490.1 = 1)");
        }
        
        if (!safetySensor) {
          logger.error("🚨 SAFETY VIOLATION: Safety sensor interrupted (1490.2 = 0)");
        }
        
        // If all conditions are met, log success
        if (partPresent && !emergencyStop && safetySensor) {
          if (checkCount % 10 === 0) { // Only log every 10th time to avoid spam
            logger.success("✅ All safety conditions are met");
          }
        }
        
      } catch (error) {
        logger.error(`❌ Error in safety monitoring: ${error.message}`);
      }
    }, 100); // Check every 100ms
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info("\n🛑 Stopping safety monitoring...");
      clearInterval(monitorInterval);
      logger.success("✅ Safety monitoring stopped");
      process.exit(0);
    });
    
  } catch (error) {
    logger.error("❌ Error in safety monitoring:", error);
  }
}

// Run the test
testSafetyLogging();
