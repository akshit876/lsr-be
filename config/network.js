/**
 * Centralized Network Configuration
 * All network-related IPs and ports should be defined here
 */

// PLC Configuration
export const PLC_CONFIG = {
  host: process.env.NEXT_PUBLIC_MODBUS_IP || "192.168.3.146",
  port: parseInt(process.env.NEXT_PUBLIC_MODBUS_PORT, 10) || 502,
  timeout: 5000,
  reconnectInterval: 5000,
};

// Main Scanner Configuration
export const MAIN_SCANNER_CONFIG = {
  host: process.env.SCANNER_HOST || "192.168.3.147",
  port: parseInt(process.env.SCANNER_PORT, 10) || 502,
  timeout: 5000,
  reconnectInterval: 3000,
  keepAlive: true,
  keepAliveInitialDelay: 1000,
  logDir: "scanner_logs",
};

// Middle Scanner Configuration
export const MIDDLE_SCANNER_CONFIG = {
  host: process.env.MIDDLE_SCANNER_HOST || "192.168.3.148",
  port: parseInt(process.env.MIDDLE_SCANNER_PORT, 10) || 502,
  timeout: 5000,
  reconnectInterval: 3000,
  keepAlive: true,
  keepAliveInitialDelay: 1000,
  logDir: "scanner_logs",
};

// Network Configuration Summary
export const NETWORK_CONFIG = {
  plc: PLC_CONFIG,
  mainScanner: MAIN_SCANNER_CONFIG,
  middleScanner: MIDDLE_SCANNER_CONFIG,
};

// Helper function to get all network devices
export function getAllNetworkDevices() {
  return [
    { name: "PLC", ...PLC_CONFIG },
    { name: "Main Scanner", ...MAIN_SCANNER_CONFIG },
    { name: "Middle Scanner", ...MIDDLE_SCANNER_CONFIG },
  ];
}

// Helper function to validate network configuration
export function validateNetworkConfig() {
  const devices = getAllNetworkDevices();
  const errors = [];

  devices.forEach((device) => {
    if (!device.host || !device.port) {
      errors.push(`${device.name}: Missing host or port configuration`);
    }

    if (device.port < 1 || device.port > 65535) {
      errors.push(`${device.name}: Invalid port number ${device.port}`);
    }

    // Basic IP validation (simplified)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(device.host)) {
      errors.push(`${device.name}: Invalid IP address format ${device.host}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
}

export default NETWORK_CONFIG;
