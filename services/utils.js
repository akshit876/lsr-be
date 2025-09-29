import logger from "../logger.js";

export function emitErrorEvent(socket, errorType, errorMessage) {
  if (socket) {
    socket.emit("error", {
      type: errorType,
      message: errorMessage,
    });
  }
  logger.error(`${errorType}: ${errorMessage}`);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
