import { parentPort } from 'worker_threads';
import { scannerController } from "../services/scanCycles.js";
import { connect } from "../services/modbus.js";
import logger from "../logger.js";

async function runScanner(partNumber) {
  await connect();
  
  await scannerController.runContinuousScan(null, null, { partNumber });
}

parentPort.on('message', (message) => {
  if (message.type === 'start') {
    runScanner(message.partNumber).catch(error => {
      parentPort.postMessage({ type: 'error', data: error.message });
    });
  }
}); 