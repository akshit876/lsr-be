// import logger from "../logger.js";
const logger = require("../logger.cjs");
 function emitErrorEvent(socket, errorType, errorMessage) {
  if (socket) {
    socket.emit("error", {
      type: errorType,
      message: errorMessage,
    });
  }
  logger.error(`${errorType}: ${errorMessage}`);
}

module.exports = { emitErrorEvent };