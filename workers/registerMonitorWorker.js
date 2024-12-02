import { parentPort } from 'worker_threads';
import { connect, readBit } from '../services/modbus.js';
import logger from '../logger.js';

const REGISTER_MONITORING_CONFIG = {
  register: 1490,
  interval: 100,
  bits: {
    0: {
      eventName: "part-presence",
      message: "Part not present.............",
    },
    1: {
      eventName: "emergency-stop",
      message: "Emergency button pressed.............",
    },
    2: {
      eventName: "light-curtation",
      message: "Light curtain error.............",
    },
  },
};

let intervalId = null;
let isInitialized = false;

async function initializeWorker() {
  if (isInitialized) return;
  
  try {
    await connect();
    isInitialized = true;
    logger.info('Register worker: Modbus connection established');

    intervalId = setInterval(async () => {
      try {
        const { register, bits } = REGISTER_MONITORING_CONFIG;
        
        for (const [bit, config] of Object.entries(bits)) {
          const value = await readBit(register, parseInt(bit));
          if (value) {
            parentPort.postMessage({
              type: config.eventName,
              data: {
                register,
                bit: parseInt(bit),
                value,
                message: config.message,
                timestamp: new Date().toISOString(),
              }
            });
          }
        }
      } catch (error) {
        logger.error('Register monitoring error:', error);
        isInitialized = false;
        clearInterval(intervalId);
        
        // Attempt to reinitialize after error
        setTimeout(() => {
          initializeWorker().catch(err => {
            parentPort.postMessage({
              type: 'error',
              data: `Failed to reinitialize worker: ${err.message}`
            });
          });
        }, 5000);
      }
    }, REGISTER_MONITORING_CONFIG.interval);
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      data: `Failed to initialize Modbus connection in register worker: ${error.message}`
    });
    throw error;
  }
}

parentPort.on('message', async (message) => {
  if (message.type === 'start') {
    await initializeWorker();
  } else if (message.type === 'stop') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
});

process.on('SIGTERM', () => {
  if (intervalId) {
    clearInterval(intervalId);
  }
}); 