# Laser Marking and Verification System - Product Specification

## System Overview

A comprehensive industrial laser marking system with real-time verification, PLC integration, and database management for manufacturing quality control.

## Core Components

### 1. Scanner Controller System

- **Purpose**: Manages the complete marking and verification workflow
- **Architecture**: Singleton pattern with event-driven design
- **Key Features**:
  - Multi-scanner support (TCP-based scanners)
  - PLC communication via Modbus TCP
  - Real-time reset monitoring
  - Cycle state management
  - Error handling and recovery

### 2. PLC Integration

- **Protocol**: Modbus TCP
- **Connection**: 192.168.3.146:502
- **Key Registers**:
  - `1410.0`: Start signal
  - `1410.1`: OCR read trigger
  - `1410.2`: Laser data transfer signal
  - `1410.3`: Scanner read trigger
  - `1410.11`: File transfer signal
  - `1410.12`: Cycle completion signal
  - `1414.3`: Data match OK
  - `1414.4`: Data match NG
  - `1414.6`: First scan OK
  - `1414.7`: First scan NG
  - `1414.15`: OCR read confirmation
  - `1600.0`: Reset signal
  - `1450`: OCR data (20 bits)
  - `1470`: Scanner data (20 bits)

### 3. Scanner System

- **Types**:
  - Main Scanner (TCP)
  - Middle Scanner (TCP)
  - Verification Scanner (TCP)
- **Communication**: TCP socket connections
- **Data Format**: ASCII strings with barcode data
- **Timeout**: 30 seconds per scan operation

### 4. Database Integration

- **Database**: MongoDB
- **Collection**: main-data.records
- **Data Structure**:
  ```json
  {
    "SerialNumber": "string",
    "MarkingData": "string",
    "ScannerData": "string",
    "Result": "OK|NG",
    "Grading": "A|B|C|N/A",
    "ModelNumber": "string",
    "Timestamp": "ISO date",
    "User": "string",
    "CurrentId": "number"
  }
  ```

## Workflow Specification

### Complete Cycle Flow

1. **Cycle Initialization**

   - Wait for start signal (1410.0)
   - Initialize reset monitoring
   - Clear previous cycle data

2. **First Scan Phase**

   - Trigger first scanner (1415.0)
   - Read scanner data from TCP
   - Check for "NG" response
   - If OK: Stop machine, signal PLC (1414.6)
   - If NG: Continue to next phase

3. **Barcode Generation Phase**

   - Generate serial number using shift utility
   - Create barcode data with date/shift info
   - Write OCR data to code.txt file
   - Signal file transfer (1410.11)

4. **Laser Marking Phase**

   - Wait for laser ready signal (1410.2)
   - Transfer data to laser system
   - Confirm transfer (1415.1)
   - Wait for marking completion

5. **Middle Scan Phase**

   - Trigger middle scanner (1418.0)
   - Read and process scanner data
   - Validate marking quality
   - Update database with marking data

6. **Verification Scan Phase**

   - Trigger verification scanner (1416.15)
   - Read verification data
   - Compare with expected data
   - Signal result to PLC (1414.3 or 1414.4)
   - Update database with final result

7. **Cycle Completion**
   - Wait for completion signal (1410.12)
   - Clean up files and reset bits
   - Increment cycle counter
   - Log completion status

### Reset Handling

- **Reset Signal**: Bit 1600.0
- **Monitoring**: Continuous check every 100ms
- **Reset Actions**:
  - Abort current operation
  - Clear all PLC bits
  - Clean up files
  - Restart cycle from beginning
  - Decrement serial number counter

## Technical Requirements

### Dependencies

```json
{
  "modbus-serial": "^8.0.11",
  "mongodb": "^4.0.0",
  "socket.io": "^4.0.0",
  "winston": "^3.0.0",
  "cron": "^2.0.0"
}
```

### Configuration

- **Scanner Timeout**: 30 seconds
- **Reset Check Interval**: 100ms
- **PLC Connection Retry**: 5 attempts
- **Database Retry**: 5 attempts
- **File Paths**:
  - Code file: `./data/code.txt`
  - Logs: `./logs/`

### Error Handling

- **Connection Errors**: Automatic retry with exponential backoff
- **Scanner Timeouts**: Treat as "NG" and continue
- **PLC Communication Errors**: Log and retry
- **Database Errors**: Log and continue with local fallback
- **File System Errors**: Log and retry

## API Endpoints

### WebSocket Events

- `connection`: Client connection
- `data`: Real-time data updates
- `pulse_on`: Enable cycle processing
- `pulse_off`: Disable cycle processing

### HTTP Endpoints

- `GET /api/records`: Fetch all records
- `GET /api/records/:id`: Fetch specific record
- `POST /api/records`: Create new record
- `PUT /api/records/:id`: Update record
- `DELETE /api/records/:id`: Delete record

## Data Models

### ScannerController Class

```javascript
class ScannerController {
  constructor()
  async initialize()
  async runContinuousScan(io, comService, partNumber)
  async executeScanCycle(tcpScannerService)
  async handleFirstScan(tcpScannerService)
  async handleMiddleScan()
  async handleVerificationScan(tcpScannerService, barcodeData)
  async fetchScannerData(tcpScannerService, options)
  async checkReset()
  async checkResetOrBit(register, bit, value)
  async saveToMongoDB(data)
  async generateAndWriteBarcode(partNumber, ocrData)
  async compareScannerDataWithCode(scannerData)
  async performFinalChecks()
  async handleReset()
  async handleError(error)
}
```

### BarcodeGenerator Class

```javascript
class BarcodeGenerator {
  constructor(shiftUtility)
  async generateBarcodeData(options)
  async writeOCRDataToFile(data)
  async writeTextDataToFile(data)
  async writeCodeDataToFile(data)
  incSerialNo()
  decSerialNo()
}
```

### ShiftUtility Class

```javascript
class ShiftUtility {
  constructor()
  getCurrentShift()
  getShiftConfig()
  isShiftActive()
  getShiftStartTime()
  getShiftEndTime()
}
```

## File Structure

```
services/
├── scanCycles.js          # Main scanner controller
├── testCycle.js           # Legacy cycle implementation
├── barcodeGenerator.js    # Barcode generation logic
├── serialNumber.js        # Serial number management
├── ShiftUtility.js        # Shift management
├── mongoDbService.js      # Database operations
├── modbus.js              # PLC communication
├── tcp.js                 # TCP scanner communication
├── resetMonitor.js        # Reset monitoring worker
└── monitorReset.js        # Alternative reset monitor
```

## Key Features

### 1. Multi-Scanner Support

- Simultaneous monitoring of multiple scanners
- Automatic failover between scanners
- Data aggregation from multiple sources

### 2. Real-time Monitoring

- Live cycle status updates
- Real-time data streaming to UI
- Comprehensive logging system

### 3. Quality Control

- Data validation at each step
- Duplicate detection
- Result verification
- Audit trail maintenance

### 4. Error Recovery

- Automatic retry mechanisms
- Graceful degradation
- State persistence
- Recovery procedures

### 5. Performance Optimization

- Asynchronous operations
- Connection pooling
- Memory management
- Resource cleanup

## Testing Scenarios

### 1. Normal Operation

- Complete cycle from start to finish
- All scanners working correctly
- PLC communication stable
- Database operations successful

### 2. Error Scenarios

- Scanner timeout
- PLC communication failure
- Database connection loss
- File system errors
- Network interruptions

### 3. Reset Scenarios

- Reset during first scan
- Reset during middle scan
- Reset during verification
- Reset during data processing

### 4. Edge Cases

- Empty scanner data
- Invalid barcode data
- Duplicate serial numbers
- System startup/shutdown
- Configuration changes

## Deployment Requirements

### Hardware

- Industrial PC with Windows 10+
- Network connectivity to PLC and scanners
- Sufficient storage for logs and data
- Backup power supply

### Software

- Node.js 16+
- MongoDB 4.0+
- Network access to PLC (192.168.3.146:502)
- TCP access to scanner systems

### Network

- Stable connection to PLC
- Reliable scanner network
- Database connectivity
- Web interface access

## Security Considerations

- Network security for PLC communication
- Database access controls
- File system permissions
- Log data protection
- User authentication (if required)

## Maintenance

### Daily

- Check system logs
- Verify scanner connectivity
- Monitor cycle completion rates
- Review error patterns

### Weekly

- Database maintenance
- Log file cleanup
- Performance analysis
- Configuration review

### Monthly

- Full system backup
- Hardware inspection
- Software updates
- Documentation updates

## Troubleshooting Guide

### Common Issues

1. **Scanner Timeout**: Check network connectivity and scanner status
2. **PLC Communication Error**: Verify IP address and port configuration
3. **Database Connection Failed**: Check MongoDB service and credentials
4. **Reset Loop**: Investigate PLC reset signal triggers
5. **File Write Error**: Check file permissions and disk space

### Diagnostic Commands

- Network ping tests
- Port connectivity checks
- Database connection tests
- File system verification
- Log analysis tools

This specification provides a complete foundation for generating code for a laser marking and verification system with PLC integration, multi-scanner support, and comprehensive error handling.

