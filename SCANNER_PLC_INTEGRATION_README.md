# Scanner PLC Integration Update

## Overview

This update implements automatic writing of scanner data to PLC register 3000 and saves scanned data to text files in the D: directory whenever a scanner successfully reads data.

## Changes Made

### 1. IP Address Updates

- **PLC IP**: Updated from `192.168.3.146` to `192.168.72.116`
- **Scanner IP**: Updated from `192.168.3.145` to `192.168.72.118`

### 2. Files Modified

- `services/modbus.js` - Updated default PLC IP address
- `services/scanCycles.js` - Updated scanner IP and added PLC integration
- `services/TcpScannerService.js` - Updated default scanner IP
- `test-tcp-scanner.js` - Updated test configuration

### 3. New Functionality

#### PLC Register Writing

- When scanner successfully reads data, it automatically writes to **multiple consecutive PLC registers starting from 3000**
- **Register 3000**: First 8 characters of scanner data
- **Register 3001**: Next 8 characters of scanner data
- **Register 3002**: Next 8 characters of scanner data
- **...and so on** until all scanner data is written
- **Register 2999**: Status register containing the total number of registers used
- Uses the existing `writeRegisterFull` function for efficient bulk writing
- Each register can hold 8 characters (16 bits = 2 bytes per character)
- Automatically calculates how many registers are needed based on scanner data length

#### File Saving

- Scanned data is automatically written to a single `scan_data.txt` file in D: directory
- **Only the scanner data is saved** (no timestamps, no scan type labels)
- **File is overridden each time** - previous data is replaced with new scan data
- Fallback to local `./scan_data.txt` file if D: drive is not accessible
- File always contains only the most recent successful scan data

#### Integration Points

- **First Scan**: Triggers when `handleFirstScan` receives valid scanner data
- **Verification Scan**: Triggers when `handleVerificationScan` receives valid scanner data
- Both scan types now automatically call `handleSuccessfulScan` method

### 4. New Method: `handleSuccessfulScan`

```javascript
async handleSuccessfulScan(scannerData, scanType)
```

This method:

- Writes scanner data to multiple PLC registers starting from 3000
- Saves scanned data to D: directory
- Emits UI events for real-time monitoring
- Handles errors gracefully without stopping the workflow

### 5. New Method: `writeScannerDataToMultipleRegisters`

```javascript
async writeScannerDataToMultipleRegisters(scannerData)
```

This method:

- Splits scanner data into 8-character chunks
- Converts each chunk to a 16-bit register value
- Writes to consecutive registers starting from 3000
- Updates status register 2999 with the total number of registers used
- Uses efficient bulk writing with `writeRegisterFull`

### 5. Error Handling

- PLC write failures are logged but don't stop the workflow
- File save failures trigger fallback to local directory
- All errors are logged with detailed information
- UI events are emitted for monitoring and debugging

## Usage

### Automatic Operation

The integration works automatically - no manual intervention required:

1. Scanner reads data successfully
2. Data is automatically written to PLC register 3000
3. Data is automatically saved to D: directory
4. UI receives real-time updates

### Testing

Run the test script to verify functionality:

```bash
node test-scanner-plc-integration.js
```

### Configuration

IP addresses can be overridden using environment variables:

- `MODBUS_IP` - PLC IP address
- `SCANNER_HOST` - Scanner IP address
- `SCANNER_PORT` - Scanner port (default: 502)

## File Structure

```
D:/scan_data.txt
```

Example file content:

```
ABC123456
```

**Note**: The file contains only the scanner data. Each new scan overwrites the previous content.

## PLC Register Distribution Example

**Scanner Data**: `"ABC123456"` (9 characters)

**Register Distribution**:

- **Register 3000**: `"ABC12345"` (first 8 characters)
- **Register 3001**: `"6"` (remaining 1 character)
- **Register 2999**: `2` (total number of registers used)

**Scanner Data**: `"SHORT"` (5 characters)

**Register Distribution**:

- **Register 3000**: `"SHORT"` (all 5 characters fit in one register)
- **Register 2999**: `1` (total number of registers used)

**Scanner Data**: `"VERY_LONG_SCANNER_DATA_123"` (25 characters)

**Register Distribution**:

- **Register 3000**: `"VERY_LONG"` (characters 1-8)
- **Register 3001**: `"_SCANNER"` (characters 9-16)
- **Register 3002**: `"_DATA_12"` (characters 17-24)
- **Register 3003**: `"3"` (character 25)
- **Register 2999**: `4` (total number of registers used)

## Monitoring

The system emits these events for real-time monitoring:

- `scan_data_saved` - When data is saved to file
- `scanner_read` - When scanner data is received
- `first_scan_ok` - When first scan detects existing marking

## Troubleshooting

- Check PLC connectivity if register 3000 writes fail
- Verify D: drive accessibility for file saving
- Monitor logs for detailed error information
- Use test script to isolate issues

## Dependencies

- Existing modbus service for PLC communication
- File system operations for data saving
- TCP scanner service for data acquisition
- Event system for UI updates
