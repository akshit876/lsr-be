import winston from 'winston';
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
  single: () => console.log(`${colors.cyan}${'-'.repeat(separatorLength)}${colors.reset}`), // Added single separator
  star: () => console.log(`${colors.cyan}${'*'.repeat(separatorLength)}${colors.reset}`),
  hash: () => console.log(`${colors.cyan}${'#'.repeat(separatorLength)}${colors.reset}`),
  arrow: () => console.log(`${colors.cyan}${'→'.repeat(separatorLength)}${colors.reset}`),
  dot: () => console.log(`${colors.cyan}${'•'.repeat(separatorLength)}${colors.reset}`)
};

// Custom format for console
const customFormat = winston.format.printf(({ level, message }) => {
  const timestamp = getISTTimestamp();
  
  // Color mapping for different levels
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
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: winston.format.printf(({ level, message }) => {
        const timestamp = getISTTimestamp();
        return `${timestamp} [${level.toUpperCase()}] ${message}`;
      })
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: winston.format.printf(({ level, message }) => {
        const timestamp = getISTTimestamp();
        return `${timestamp} [${level.toUpperCase()}] ${message}`;
      })
    })
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
