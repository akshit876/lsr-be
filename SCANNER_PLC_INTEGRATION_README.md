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

- When scanner successfully reads data, it automatically writes to PLC register 3000
- Uses the existing `writeRegister` function from modbus service
- Logs success/failure of PLC write operations

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

- Writes scanner data to PLC register 3000
- Saves scanned data to D: directory with timestamp
- Emits UI events for real-time monitoring
- Handles errors gracefully without stopping the workflow

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
