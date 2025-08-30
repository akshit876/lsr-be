import winston from "winston";
import { config } from "../config/index.js";

// Create custom format
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: "HH:mm:ss",
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create transports
const transports = [];

// Console transport
transports.push(
  new winston.transports.Console({
    format:
      config.server.environment === "development"
        ? consoleFormat
        : customFormat,
    level: config.logging.level,
  })
);

// File transport for production
if (config.server.environment === "production") {
  transports.push(
    new winston.transports.File({
      filename: config.logging.file,
      format: customFormat,
      level: config.logging.level,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: customFormat,
  transports,
  exitOnError: false,
});

// Add custom methods for better UX
logger.success = (message, meta = {}) => {
  logger.info(message, { ...meta, level: "SUCCESS" });
};

// Note: warn, error, and debug are already provided by Winston, so we don't override them
// logger.warn, logger.error, and logger.debug are already available from Winston

logger.section = (message, meta = {}) => {
  logger.info(`\n${"=".repeat(50)}\n${message}\n${"=".repeat(50)}`, {
    ...meta,
    level: "SECTION",
  });
};

export { logger };
