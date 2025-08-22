/**
 * Configuration file for LSR Backend
 * Centralized configuration management
 */

export const CONFIG = {
  // PLC Configuration
  PLC: {
    IP: "192.168.3.147", // Updated from 192.168.3.146
    PORT: 502,
    TIMEOUT: 100000, // 100 seconds
  },

  // Scanner Configuration
  SCANNER: {
    COM_PORT: "COM3",
    BAUD_RATE: 9600,
    LOG_DIR: "scanner_logs",
  },

  // Text File Format Configuration
  TEXT_FILE_FORMAT: {
    JULIAN_DATE: true,
    YEAR_CODE: true,
    COMPANY_CODE: "R", // Fixed company code
    DMC_CODE: "DMC001", // Default DMC code
  },

  // File Paths
  PATHS: {
    CODE_FILE: "./data/code.txt",
    TEXT_FILE: "./data/text.txt",
    LOGS_DIR: "./logs",
  },
};

export default CONFIG;
