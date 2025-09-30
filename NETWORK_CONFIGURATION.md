# Network Configuration Guide

This document describes the centralized network configuration system used throughout the laser marking system.

## 📋 Overview

All network-related IP addresses and ports are now centralized in `config/network.js` to ensure consistency across the entire codebase.

## 🔧 Configuration Files

### Main Configuration

- **File**: `config/network.js`
- **Purpose**: Centralized network configuration
- **Exports**: `PLC_CONFIG`, `MAIN_SCANNER_CONFIG`, `MIDDLE_SCANNER_CONFIG`

### Validation Script

- **File**: `scripts/validate-network-config.js`
- **Purpose**: Validates network configuration consistency
- **Usage**: `node scripts/validate-network-config.js`

## 🌐 Network Devices

### 1. PLC (Programmable Logic Controller)

- **Default IP**: `192.168.3.146`
- **Port**: `502` (Modbus TCP)
- **Environment Variables**:
  - `NEXT_PUBLIC_MODBUS_IP`
  - `NEXT_PUBLIC_MODBUS_PORT`
- **Used by**: `services/modbus.js`

### 2. Main Scanner

- **Default IP**: `192.168.3.147`
- **Port**: `502`
- **Environment Variables**:
  - `SCANNER_HOST`
  - `SCANNER_PORT`
- **Used by**: `services/TcpScannerService.js`, `services/scanCycles.js`

### 3. Middle Scanner

- **Default IP**: `192.168.3.148`
- **Port**: `502`
- **Environment Variables**:
  - `MIDDLE_SCANNER_HOST`
  - `MIDDLE_SCANNER_PORT`
- **Used by**: `services/scanCycles.js`

## 🚀 Usage

### Importing Configuration

```javascript
// Import specific configurations
import {
  PLC_CONFIG,
  MAIN_SCANNER_CONFIG,
  MIDDLE_SCANNER_CONFIG,
} from "../config/network.js";

// Import all configurations
import { NETWORK_CONFIG } from "../config/network.js";

// Import helper functions
import {
  getAllNetworkDevices,
  validateNetworkConfig,
} from "../config/network.js";
```

### Using in Services

```javascript
// Before (hardcoded)
const tcpScannerService = new TcpScannerService({
  host: "192.168.3.147",
  port: 502,
  // ... other options
});

// After (centralized)
import { MAIN_SCANNER_CONFIG } from "../config/network.js";
const tcpScannerService = new TcpScannerService(MAIN_SCANNER_CONFIG);
```

## 🔍 Validation

### Manual Validation

```bash
node scripts/validate-network-config.js
```

### Programmatic Validation

```javascript
import { validateNetworkConfig } from "../config/network.js";

const validation = validateNetworkConfig();
if (!validation.isValid) {
  console.error("Configuration errors:", validation.errors);
}
```

## 🌍 Environment Variables

Create a `.env` file in your project root to override default values:

```env
# PLC Configuration
NEXT_PUBLIC_MODBUS_IP=192.168.3.146
NEXT_PUBLIC_MODBUS_PORT=502

# Main Scanner Configuration
SCANNER_HOST=192.168.3.147
SCANNER_PORT=502

# Middle Scanner Configuration
MIDDLE_SCANNER_HOST=192.168.3.148
MIDDLE_SCANNER_PORT=502
```

## 📁 Files Updated

The following files have been updated to use centralized configuration:

1. **`config/network.js`** - New centralized configuration file
2. **`services/modbus.js`** - Updated to use `PLC_CONFIG`
3. **`services/scanCycles.js`** - Updated to use `MAIN_SCANNER_CONFIG` and `MIDDLE_SCANNER_CONFIG`
4. **`services/TcpScannerService.js`** - Updated to use `MAIN_SCANNER_CONFIG`
5. **`test-tcp-scanner.js`** - Updated to use `MAIN_SCANNER_CONFIG`
6. **`server.js`** - Updated commented code to use centralized config

## ✅ Benefits

1. **Consistency**: All network configurations are in one place
2. **Maintainability**: Easy to update IP addresses across the entire system
3. **Validation**: Built-in validation ensures configuration integrity
4. **Environment Support**: Easy to override with environment variables
5. **Documentation**: Clear documentation of all network devices

## 🔧 Troubleshooting

### Common Issues

1. **Import Errors**: Make sure to use the correct import path
2. **Environment Variables**: Check that environment variables are properly set
3. **Network Connectivity**: Verify that all devices are reachable on the network

### Validation Errors

If validation fails, check:

- IP address format (must be valid IPv4)
- Port numbers (must be between 1-65535)
- Environment variable syntax
- File import paths

## 📞 Support

For network configuration issues:

1. Run the validation script: `node scripts/validate-network-config.js`
2. Check the logs for specific error messages
3. Verify network connectivity to all devices
4. Ensure environment variables are correctly set
