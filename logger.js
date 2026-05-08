import winston from 'winston';
import 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';

// Ensure log directory exists
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// ANSI Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Format timestamp to IST with correct format
const getISTTimestamp = () => {
  const date = new Date();
  try {
    return format(date, 'dd-MM-yyyy hh:mm:ss aa');
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return date.toISOString();
  }
};

// Separator styles
const separatorLength = 100;
const separator = {
  line: () => console.log(`${colors.cyan}${'-'.repeat(separatorLength)}${colors.reset}`),
  double: () => console.log(`${colors.cyan}${'='.repeat(separatorLength)}${colors.reset}`),
  single: () => console.log(`${colors.cyan}${'-'.repeat(separatorLength)}${colors.reset}`),
  star: () => console.log(`${colors.cyan}${'*'.repeat(separatorLength)}${colors.reset}`),
  hash: () => console.log(`${colors.cyan}${'#'.repeat(separatorLength)}${colors.reset}`),
  arrow: () => console.log(`${colors.cyan}${'→'.repeat(separatorLength)}${colors.reset}`),
  dot: () => console.log(`${colors.cyan}${'•'.repeat(separatorLength)}${colors.reset}`)
};

// Custom format for console
const customFormat = winston.format.printf(({ level, message }) => {
  const timestamp = getISTTimestamp();

  const levelColors = {
    error: colors.red,
    warn: colors.yellow,
    info: colors.cyan,
    debug: colors.green,
    success: colors.green,
  };

  const color = levelColors[level] || colors.cyan;
  return `${timestamp} ${color}[${level.toUpperCase()}] ${message}${colors.reset}`;
});

const fileFormat = winston.format.printf(({ level, message }) => {
  const timestamp = getISTTimestamp();
  return `${timestamp} [${level.toUpperCase()}] ${message}`;
});

// Daily rotation config shared across transports
// Files: error-2026-05-08.log, combined-2026-05-08.log
// Keeps 30 days, max 20MB per file, old logs auto-deleted
const rotateDefaults = {
  dirname: logDir,
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  zippedArchive: true,
  format: fileFormat,
};

// Create logger
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    customFormat
  ),
  transports: [
    new winston.transports.Console({
      format: customFormat
    }),
    new winston.transports.DailyRotateFile({
      ...rotateDefaults,
      filename: 'error-%DATE%.log',
      level: 'error',
    }),
    new winston.transports.DailyRotateFile({
      ...rotateDefaults,
      filename: 'combined-%DATE%.log',
    }),
  ]
});

// Add custom methods
logger.separator = separator;
logger.success = (message) => logger.info(`${colors.green}✓ ${message}${colors.reset}`);
logger.highlight = (message) => logger.warn(`${colors.magenta}⚡ ${message}${colors.reset}`);

// Section method
logger.section = (title) => {
  separator.double();
  logger.highlight(title);
  separator.line();
};

export default logger;
