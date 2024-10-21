import winston from "winston";
import fs from "fs";
import path from "path";

// Ensure log directory exists
const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Create a custom format for the file output with service name
const fileFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.printf(({ timestamp, level, message, stack, service }) => {
    return `${timestamp} [${level}]  : ${stack || message}`;
  })
);

// Create a custom format for the console output with service name
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.printf(({ timestamp, level, message, stack, service }) => {
    // return `${timestamp} [${level}] [${service}] : ${stack || message}`;
    return `${timestamp} [${level}]: ${stack || message}`;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: "info",
  defaultMeta: {}, // Set the service name here
  transports: [
    // Console transport with colored and readable logs
    // new winston.transports.Console({
    //   format: consoleFormat,
    // }),
    // File transport for error logs (JSON format)
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    // File transport for combined logs (readable format with service name)
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      format: fileFormat,
    }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export default logger;
