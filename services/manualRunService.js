import {
  readRegister,
  readRegisterAndProvideASCII,
  writeBit,
  connect
} from "./modbus.js";
import logger from "../logger.js";
import { emitErrorEvent } from "./utils.js";
// import { emitErrorEvent } from "../utils/errorHandler.js"; // Import the error utility

const resetTime = 200;

const MANUAL_RUN_ADDRESSES = {
  markingStart: { address: 1414, bit: 0 },
  scannerTrigger: { address: 1414, bit: 1 },
  ocrTrigger: { address: 1414, bit: 2 },
  workLight: { address: 1414, bit: 3 },
  servohomeposition: { address: 1414, bit: 4 },
  servoscannerposition: { address: 1414, bit: 5 },
  servoocrposition: { address: 1414, bit: 6 },
  servomarkposition: { address: 1414, bit: 7 },
  jogFwd: { address: 1414, bit: 8 },
  jogRev: { address: 1414, bit: 9 },
  servoHome: { address: 1414, bit: 10 },
};

export async function manualRun(operation, socket) {
  if (!MANUAL_RUN_ADDRESSES[operation]) {
    const errorMessage = `Invalid operation: ${operation}`;
    emitErrorEvent(socket, "INVALID_MANUAL_RUN_OPERATION", errorMessage);
    throw new Error(errorMessage);
  }

  const { address, bit } = MANUAL_RUN_ADDRESSES[operation];

  try {
    await writeBit(address, bit, 1);
    logger.info(`Manual run operation executed: ${operation}`);

    // Reset the bit after resetTime
    setTimeout(async () => {
      try {
        await writeBit(address, bit, 0);
        logger.info(`Manual run operation reset: ${operation}`);
      } catch (resetError) {
        const errorMessage = `Error resetting manual run operation ${operation}: ${resetError.message}`;
        emitErrorEvent(socket, "MANUAL_RUN_RESET_ERROR", errorMessage);
        logger.error(errorMessage);
      }
    }, resetTime);

    return {
      success: true,
      message: `Operation ${operation} executed successfully`,
    };
  } catch (error) {
    const errorMessage = `Error executing manual run operation ${operation}: ${error.message}`;
    emitErrorEvent(socket, "MANUAL_RUN_EXECUTION_ERROR", errorMessage);
    logger.error(errorMessage);
    throw error;
  }
}

async function runTest() {
  try {
    await connect();
    // await writeBit(1414, 14, 0);
    // await writeBit(1414, 15, 0);
    // await writeBit(1414, 13, 0);
    // await writeBit(1414, 12, 0);
    // await writeBit(1415, 2, 0); //rest
    // await writeBit(1415, 9, 1);
    // await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
    // await writeBit(1415, 2, 0); //rest
    // await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
    await readRegister(1450, 20);
    // await readRegisterAndProvideASCII(1450, 3); //date
    // await readRegisterAndProvideASCII(1453, 1); //shift
    // await readRegisterAndProvideASCII(1454, 2); //die
    await writeBit(1415, 9, 1);
    // logger.info(`Manual run operation reset: ${operation}`);
  } catch (resetError) {
    // const errorMessage = `Error resetting manual run operation ${operation}: ${resetError.message}`;
    // emitErrorEvent(socket, "MANUAL_RUN_RESET_ERROR", errorMessage);
    // logger.error(errorMessage);
  }
}
runTest();
