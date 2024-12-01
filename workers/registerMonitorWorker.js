import { parentPort } from 'worker_threads';
import { connect, readBit } from "../services/modbus.js";
import logger from "../logger.js";

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

async function monitorRegisters() {
  await connect();
  
  const { register, interval, bits } = REGISTER_MONITORING_CONFIG;
  
  setInterval(async () => {
    try {
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
      parentPort.postMessage({ type: 'error', data: error.message });
    }
  }, interval);
}

monitorRegisters().catch(error => {
  parentPort.postMessage({ type: 'error', data: error.message });
}); 