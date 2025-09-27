# Laser Marking System - Implementation Guide

## Core Logic Flow

### 1. Main Cycle Controller

```javascript
class ScannerController {
  async runContinuousScan() {
    while (isRunning) {
      try {
        // Phase 1: Wait for start signal
        await this.checkResetOrBit(1410, 0, 1);

        // Phase 2: First scan
        const firstScanResult = await this.handleFirstScan();
        if (!firstScanResult.shouldContinue) return;

        // Phase 3: Generate barcode
        const barcodeData = await this.generateAndWriteBarcode();

        // Phase 4: Middle scan
        const middleScanResult = await this.handleMiddleScan();
        if (!middleScanResult.shouldContinue) return;

        // Phase 5: Verification scan
        const verificationResult = await this.handleVerificationScan();
        if (!verificationResult.shouldContinue) return;

        // Phase 6: Final checks
        await this.performFinalChecks();
      } catch (error) {
        await this.handleError(error);
      }
    }
  }
}
```

### 2. Reset Monitoring Logic

```javascript
// Check reset signal every 100ms
const resetCheckInterval = setInterval(async () => {
  const resetSignal = await readBit(1600, 0);
  if (resetSignal) {
    // Abort current operation
    resolve("RESET");
  }
}, 100);

// Handle reset in each phase
if (scannerData === "RESET") {
  return { shouldContinue: false };
}
```

### 3. Scanner Data Acquisition

```javascript
async fetchScannerData(tcpScannerService, options) {
  return new Promise((resolve, reject) => {
    // Set up TCP listeners
    tcpScannerService.on('data', (data) => {
      resolve(data.toString().trim());
    });

    // Trigger scanner via PLC
    await writeBit(register, bit, 1);

    // Timeout after 30 seconds
    setTimeout(() => {
      resolve("NG");
    }, 30000);
  });
}
```

## PLC Communication Details

### Modbus TCP Configuration

- **IP**: 192.168.3.146
- **Port**: 502
- **Protocol**: Modbus TCP
- **Timeout**: 5000ms
- **Retry**: 3 attempts

### Register Mappings

#### Control Registers

| Register | Bit | Purpose              | Action            |
| -------- | --- | -------------------- | ----------------- |
| 1410     | 0   | Start signal         | Read (wait for 1) |
| 1410     | 1   | OCR read trigger     | Read (wait for 1) |
| 1410     | 2   | Laser data transfer  | Read (wait for 1) |
| 1410     | 3   | Scanner read trigger | Read (wait for 1) |
| 1410     | 11  | File transfer signal | Read (wait for 1) |
| 1410     | 12  | Cycle completion     | Read (wait for 1) |

#### Status Registers

| Register | Bit | Purpose               | Action           |
| -------- | --- | --------------------- | ---------------- |
| 1414     | 3   | Data match OK         | Write (set to 1) |
| 1414     | 4   | Data match NG         | Write (set to 1) |
| 1414     | 6   | First scan OK         | Write (set to 1) |
| 1414     | 7   | First scan NG         | Write (set to 1) |
| 1414     | 15  | OCR read confirmation | Write (set to 1) |

#### Scanner Triggers

| Register | Bit | Scanner Type         | Action           |
| -------- | --- | -------------------- | ---------------- |
| 1415     | 0   | First scanner        | Write (set to 1) |
| 1416     | 15  | Verification scanner | Write (set to 1) |
| 1418     | 0   | Middle scanner       | Write (set to 1) |

#### Data Registers

| Register | Bits | Purpose      | Action       |
| -------- | ---- | ------------ | ------------ |
| 1450     | 20   | OCR data     | Read (ASCII) |
| 1470     | 20   | Scanner data | Read (ASCII) |

#### Reset Signal

| Register | Bit | Purpose      | Action                      |
| -------- | --- | ------------ | --------------------------- |
| 1600     | 0   | Reset signal | Read (monitor continuously) |

## TCP Scanner Configuration

### Scanner Types

1. **Main Scanner**: First scan operations
2. **Middle Scanner**: Marking verification
3. **Verification Scanner**: Final quality check

### TCP Connection Details

```javascript
const scannerConfigs = {
  main: {
    host: "192.168.1.100",
    port: 8080,
    timeout: 30000,
  },
  middle: {
    host: "192.168.1.101",
    port: 8080,
    timeout: 30000,
  },
  verification: {
    host: "192.168.1.102",
    port: 8080,
    timeout: 30000,
  },
};
```

### Data Format

- **Input**: ASCII string from scanner
- **Processing**: Trim whitespace, validate format
- **Output**: "OK" for valid data, "NG" for invalid/timeout

## Database Schema

### MongoDB Collection: main-data.records

```javascript
{
  SerialNumber: "string",      // Generated serial number
  MarkingData: "string",       // OCR/barcode data
  ScannerData: "string",       // Scanner read data
  Result: "OK|NG",            // Final verification result
  Grading: "A|B|C|N/A",       // Quality grade
  ModelNumber: "string",       // Part number
  Timestamp: "ISO date",       // Operation timestamp
  User: "string",             // Operator name
  CurrentId: "number"         // Cycle counter
}
```

## Key Implementation Functions

### 1. PLC Communication

```javascript
async function readBit(register, bit) {
  // Read single bit from PLC
  const client = new ModbusRTU();
  await client.connectTCP(ip, { port: 502 });
  const data = await client.readCoils(register, 1);
  return data.data[0];
}

async function writeBit(register, bit, value) {
  // Write single bit to PLC
  const client = new ModbusRTU();
  await client.connectTCP(ip, { port: 502 });
  await client.writeCoil(register + bit, value);
}
```

### 2. Scanner Communication

```javascript
async function connectScanner(config) {
  const socket = new net.Socket();
  return new Promise((resolve, reject) => {
    socket.connect(config.port, config.host, () => {
      resolve(socket);
    });
    socket.on("error", reject);
  });
}

async function readScannerData(socket, timeout) {
  return new Promise((resolve) => {
    socket.on("data", (data) => {
      resolve(data.toString().trim());
    });
    setTimeout(() => resolve("NG"), timeout);
  });
}
```

### 3. Data Processing

```javascript
async function compareScannerDataWithCode(scannerData) {
  const codeData = await fs.readFileSync("code.txt", "utf8");
  return scannerData === codeData.trim();
}

async function generateBarcodeData(partNumber) {
  const date = new Date();
  const shift = getCurrentShift();
  const serialNo = generateSerialNumber();
  return {
    text: `${partNumber}${serialNo}`,
    serialNo: serialNo,
  };
}
```

## Error Handling Patterns

### 1. Connection Errors

```javascript
try {
  await connectPLC();
} catch (error) {
  logger.error("PLC connection failed:", error);
  await sleep(5000);
  // Retry logic
}
```

### 2. Scanner Timeouts

```javascript
const scannerData = await fetchScannerData(scanner, {
  timeout: 30000,
});

if (scannerData === "NG") {
  logger.warn("Scanner timeout, treating as NG");
  // Continue with NG result
}
```

### 3. Reset Handling

```javascript
if (await checkReset()) {
  logger.warn("Reset detected, restarting cycle");
  await resetBits();
  await clearCodeFile();
  return { shouldContinue: false };
}
```

## File Operations

### Code File Management

```javascript
const CODE_FILE_PATH = "./data/code.txt";

async function writeOCRDataToFile(data) {
  await fs.writeFileSync(CODE_FILE_PATH, data, "utf8");
}

async function clearCodeFile() {
  await fs.writeFileSync(CODE_FILE_PATH, "", "utf8");
}
```

## Cycle State Management

### State Transitions

1. **WAITING**: Waiting for start signal (1410.0)
2. **FIRST_SCAN**: Processing first scanner data
3. **BARCODE_GEN**: Generating and writing barcode
4. **MIDDLE_SCAN**: Processing middle scanner data
5. **VERIFICATION**: Processing verification scanner data
6. **FINAL_CHECK**: Performing final validations
7. **COMPLETE**: Cycle completed successfully

### Reset Conditions

- Bit 1600.0 becomes 1
- Scanner timeout (30 seconds)
- PLC communication error
- Database connection failure

## Critical Implementation Notes

### 1. Timing Requirements

- Reset check: Every 100ms
- Scanner timeout: 30 seconds
- PLC response: 5 seconds
- Database timeout: 10 seconds

### 2. Data Validation

- Scanner data: Non-empty string
- Serial numbers: Unique per shift
- Barcode format: Validated against pattern
- PLC bits: Proper state transitions

### 3. Error Recovery

- Automatic retry for transient errors
- Graceful degradation for permanent errors
- State persistence across restarts
- Logging for debugging

### 4. Performance Considerations

- Asynchronous operations
- Connection pooling
- Memory management
- Resource cleanup

This guide provides the essential logic and port details needed to implement the same laser marking system in any software platform via LLM code generation.
