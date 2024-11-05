import { parentPort } from 'worker_threads';
import { connect, readBit } from './modbus.js';
import logger from '../logger.js';

async function monitorResetSignal() {
    try {
        await connect();
        logger.info('Reset monitor connected to Modbus');

        while (true) {
          const resetSignal = await readBit(1600, 0);
          if (resetSignal) {
            logger.info("Reset signal detected (1600.0 = 1)");
            parentPort.postMessage("reset");
          }
          await new Promise((resolve) => setTimeout(resolve, 10)); // Check every 100ms
        }
    } catch (error) {
        console.log({ error });
        logger.error('Error in reset monitor:', error);
        parentPort.postMessage({ type: 'error', error: error.message });
    }
}

parentPort.on('message', message => {
    if (message === 'start') {
        monitorResetSignal();
    }
});
