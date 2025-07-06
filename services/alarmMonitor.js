import { readBit } from './modbus.js';
import logger from '../logger.js';

// Simple alarm bit definitions
const ALARMS = {
  partNotPresent: { address: 1490, bit: 0, description: "Part not present" },
  emergencyStop: { address: 1490, bit: 1, description: "Emergency stop" },
  safetySensor: { address: 1490, bit: 2, description: "Safety sensor" },
};

class AlarmMonitor {
  constructor() {
    this.isMonitoring = false;
    this.alarmStates = {
      partNotPresent: false,
      emergencyStop: false,
      safetySensor: false,
    };
    this.io = null;
  }

  // Set Socket.IO instance
  setSocketIO(io) {
    this.io = io;
  }

  // Start monitoring
  startMonitoring() {
    this.isMonitoring = true;
    logger.info('🚨 Alarm monitoring started');
  }

  // Stop monitoring
  stopMonitoring() {
    this.isMonitoring = false;
    logger.info('🚨 Alarm monitoring stopped');
  }

  // Check for alarms - call this during PLC waiting
  async checkForAlarms() {
    if (!this.isMonitoring) {
      return;
    }

    try {
      // Check all alarms
      for (const [alarmKey, config] of Object.entries(ALARMS)) {
        try {
          const currentState = await readBit(config.address, config.bit, false);
          
          // If alarm is ON and wasn't ON before
          if (currentState && !this.alarmStates[alarmKey]) {
            this.alarmStates[alarmKey] = true;
            
            // Emit simple alarm event to UI
            if (this.io) {
              this.io.emit('alarm', {
                alarm: alarmKey,
                description: config.description,
                message: `${config.description} alarm activated!`
              });
            }
            
            logger.error(`🚨 ALARM: ${config.description} activated!`);
          }
          
          // If alarm is OFF and was ON before
          if (!currentState && this.alarmStates[alarmKey]) {
            this.alarmStates[alarmKey] = false;
            logger.info(`✅ ALARM CLEARED: ${config.description}`);
          }
        } catch (error) {
          logger.error(`❌ Error checking ${config.description}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error('❌ Error in alarm check:', error);
    }
  }

  // Get current alarm states
  getAlarmStates() {
    return { ...this.alarmStates };
  }

  // Cleanup
  cleanup() {
    this.isMonitoring = false;
    this.io = null;
  }
}

// Export singleton instance
export const alarmMonitor = new AlarmMonitor(); 