import { parentPort } from 'worker_threads';
import { scannerController } from '../services/scanCycles.js';
import logger from '../logger.js';
import BufferedComPortService from '../services/ComPortService.js';

let comService = null;

parentPort.on('message', async (message) => {
  if (message.type === 'start') {
    try {
      const { partNumber } = message;
      
      // Initialize COM port service
      comService = new BufferedComPortService();
      await comService.initialize();

      // Create proxy for io to send messages back to main thread
      const ioProxy = {
        emit: (event, data) => {
          parentPort.postMessage({
            type: 'socket-event',
            event,
            data
          });
        }
      };

      // Start the continuous scan
      await scannerController.runContinuousScan(ioProxy,null, { partNumber });

    } catch (error) {
      parentPort.postMessage({
        type: 'error',
        data: error.message
      });
    }
  } else if (message.type === 'stop') {
    try {
      // Cleanup
      if (comService) {
        await comService.closePort();
      }
      await scannerController.cleanup();
    } catch (error) {
      logger.error('Error during scanner worker cleanup:', error);
    }
  }
});

// Handle cleanup on exit
process.on('SIGTERM', async () => {
  try {
    if (comService) {
      await comService.closePort();
    }
    await scannerController.cleanup();
  } catch (error) {
    logger.error('Error during scanner worker termination:', error);
  }
}); 