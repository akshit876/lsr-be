# ExecuteScanCycle Function - AI Debugging Mind Map

## 🎯 Function Overview

**Location**: `services/scanCycles.js` - Line 737-854  
**Purpose**: Main scan cycle execution logic for laser marking system  
**Entry Point**: Called from `runContinuousScan()` method  
**Return**: Promise that resolves when cycle completes or fails

---

## 🏗️ Function Structure & Flow

### 1. **INITIALIZATION PHASE**

```
┌─ executeScanCycle(tcpScannerService, partNumber)
├─ Check for start signal (1410.0)
├─ Handle reset detection
└─ Proceed to first scan if ready
```

**Key Components:**

- **Start Signal Check**: `checkResetOrBit(1410, 0, 1)`
- **Reset Handling**: Returns early if reset detected
- **Error States**: Safety violations, reset signals

---

### 2. **FIRST SCAN PHASE**

```
┌─ handleFirstScan(tcpScannerService)
├─ fetchScannerData(scanType: "first")
│  ├─ PLC TRIGGER: Write bit 1415.0 (First Scanner ON)
│  ├─ Wait for scanner data via TCP
│  └─ Handle timeout (30s) → Treat as "NG"
├─ Check for reset during scan
├─ Handle scan results:
│  ├─ NG/Timeout → Write bit 1414.7 → Continue workflow
│  ├─ Valid Data → Part already marked → Write bit 1414.6 → Stop cycle
│  └─ Reset → Return shouldContinue: false
└─ Return { shouldContinue: boolean }
```

**PLC Trigger Details:**

- **Scanner Activation**: `writeBit(1415, 0, 1)` - First Scanner ON
- **Response Bits**:
  - `1414.7` - NG scan signal
  - `1414.6` - OK scan signal (part already marked)

**Critical Decision Points:**

- **NG/Timeout**: Proceeds with marking workflow
- **Valid Data**: Part already marked, stops cycle
- **Reset**: Aborts cycle immediately

---

### 3. **BARCODE GENERATION PHASE**

```
┌─ generateAndWriteBarcode(partNumber)
├─ Check for reset before generation
├─ Generate barcode data:
│  ├─ Call barcodeGenerator.generateBarcodeData()
│  ├─ Get serial number and text content
│  └─ Generate text file content
├─ File Operations:
│  ├─ Write to CODE_FILE_PATH (barcode data)
│  ├─ Write to TEXT_FILE_PATH (text content)
│  └─ Verify file writes
├─ MongoDB Save:
│  ├─ Save initial record with "N/A" scanner data
│  └─ Set result to "N/A" (file write success)
└─ Return barcodeData or null
```

**File Paths:**

- `CODE_FILE_PATH`: `../data/code.txt`
- `TEXT_FILE_PATH`: `../data/text.txt`

---

### 4. **SIGNAL TRANSFER PHASE**

```
┌─ Signal File Transfer
├─ Write bit 1414.15(F) to signal transfer
├─ Wait for bit 1410.3 (transfer complete)
├─ Handle reset during wait:
│  ├─ Save NG result to MongoDB
│  └─ Return early
└─ Proceed to verification scan
```

**PLC Communication:**

- **Trigger**: `writeBit(1414, 15, 1)`
- **Wait For**: `checkResetOrBit(1410, 3, 1)`

---

### 5. **VERIFICATION SCAN PHASE**

```
┌─ handleVerificationScan(tcpScannerService, barcodeData)
├─ fetchScannerData(scanType: "verification")
│  ├─ PLC TRIGGER: Write bit 1416.15 (Verification Scanner ON)
│  ├─ Wait for scanner data via TCP
│  └─ Handle timeout (30s) → Treat as "NG"
├─ Handle scan results:
│  ├─ NG/Timeout → Treat as NG
│  └─ Valid Data → Compare with code file
├─ Data Comparison:
│  ├─ Read code.txt file
│  ├─ Compare scanner data with file content
│  └─ Determine match result
├─ PLC Signaling:
│  ├─ Match → Write bit 1414.3
│  └─ No Match → Write bit 1414.4
├─ MongoDB Update:
│  ├─ Update record with scanner data
│  ├─ Set result based on match
│  └─ Set grading to "N/A"
└─ Return { success: boolean }
```

**PLC Trigger Details:**

- **Scanner Activation**: `writeBit(1416, 15, 1)` - Verification Scanner ON
- **Response Bits**:
  - `1414.3` - Data match signal
  - `1414.4` - Data mismatch signal

**Comparison Logic:**

- Reads `CODE_FILE_PATH` content
- Compares with scanner data string
- Returns boolean match result

---

### 6. **FINAL CHECKS & CLEANUP PHASE**

```
┌─ performFinalChecks()
├─ Check for reset at bit 1415.7
├─ Handle reset if detected
├─ Wait 3 seconds
└─ Return success boolean
```

---

### 7. **CYCLE COMPLETION PHASE**

```
┌─ Cycle Completion Logic
├─ If finalChecksResult === true:
│  ├─ Increment cycleCount
│  ├─ Log cycle completion
│  ├─ Broadcast to UI clients
│  ├─ Emit scan-cycle-completed event
│  └─ Wait 2 seconds
├─ If finalChecksResult === false:
│  ├─ Log cycle failure
│  ├─ Broadcast failed data to UI
│  ├─ Emit failed cycle event
│  └─ Wait 2 seconds
└─ Return to continuous scan loop
```

---

## 🔧 Key Helper Functions

### **fetchScannerData()** - Lines 888-1012

- **Purpose**: Acquire data from TCP scanner
- **Parameters**: `tcpScannerService`, `options = { scanType, timeout, scannerLabel }`
- **Process**:
  1. Set up data listener with timeout
  2. Trigger scanner via PLC (register 1415/1416, bit 0/15)
  3. Wait for data or timeout
  4. Process and save data
  5. Emit UI events

### **checkResetOrBit()** - Lines 264-311

- **Purpose**: Monitor PLC bits with reset detection
- **Process**:
  1. Infinite loop until condition met
  2. Check target bit every 300ms
  3. Monitor safety registers (1490.0, 1490.1, 1490.2)
  4. Handle reset signals (1600.0)
  5. Emit UI validation events

### **saveToMongoDB()** - Lines 564-649

- **Purpose**: Save/update records in database
- **Parameters**: `{ io, serialNumber, markingData, scannerData, grading, result, isUpdate }`
- **Process**:
  1. Build data object with timestamp
  2. Get user details and model number
  3. Insert new record or update existing
  4. Broadcast to UI clients

---

## 🚨 Error Handling & Edge Cases

### **Safety Violations**

- **Trigger**: Safety bits (1490.1 = Emergency Stop)
- **Action**: Stop all cycles immediately
- **UI Event**: `validation_error` with safety details

### **Reset Detection**

- **Trigger**: Bit 1600.0 = 1
- **Actions**:
  - Clear UI validation toasts
  - Reset PLC bits
  - Decrement serial number
  - Restart cycle

### **Scanner Timeouts**

- **Timeout**: 30 seconds per scan
- **Fallback**: Treat as "NG" and continue workflow
- **Logging**: Detailed troubleshooting suggestions

### **File Write Failures**

- **Verification**: Retry up to 2 times
- **Fallback**: Return null, save error to MongoDB
- **Alternative**: Try different file paths

---

## 📊 Data Flow & State Management

### **Input Data**

- `tcpScannerService`: TCP scanner connection
- `partNumber`: Part number for barcode generation

### **Output Data**

- **MongoDB Records**: Complete scan cycle data
- **PLC Bits**: Control signals for hardware
- **Files**: Barcode data and text content
- **UI Events**: Real-time updates to frontend

### **State Variables**

- `this.cycleCount`: Current cycle number
- `this.isRunning`: Continuous scan flag
- `this.io`: Socket.IO connection for UI
- `this.currentPartNumber`: Current part being processed

---

## 🔍 Debugging Guidelines for AI Agents

### **Common Issues & Solutions**

1. **Scanner Not Responding**

   - Check TCP connection status
   - Verify PLC trigger bits
   - Check network connectivity
   - Review timeout settings

2. **File Write Failures**

   - Check file permissions
   - Verify disk space
   - Try alternative paths
   - Review file locking

3. **PLC Communication Errors**

   - Check Modbus connection
   - Verify register addresses
   - Review bit values
   - Check timeout settings

4. **MongoDB Save Failures**
   - Check database connection
   - Verify collection access
   - Review data format
   - Check user permissions

### **Key Log Points**

- Cycle start/completion
- Scanner data acquisition
- File operations
- PLC communications
- Error conditions
- Reset detections

### **Performance Monitoring**

- Cycle timing
- Scanner response times
- File I/O performance
- Database operations
- Memory usage

---

## 🔌 PLC Trigger Reference Table

### **Scanner Triggers**

| Phase             | Register | Bit | Action  | Purpose                       |
| ----------------- | -------- | --- | ------- | ----------------------------- |
| First Scan        | 1415     | 0   | Write 1 | Activate First Scanner        |
| Verification Scan | 1416     | 15  | Write 1 | Activate Verification Scanner |

### **Response Signals**

| Register | Bit | Value | Meaning                             | Action                   |
| -------- | --- | ----- | ----------------------------------- | ------------------------ |
| 1414     | 6   | 1     | First scan OK (part already marked) | Stop cycle               |
| 1414     | 7   | 1     | First scan NG/timeout               | Continue workflow        |
| 1414     | 3   | 1     | Verification scan match             | Data matches             |
| 1414     | 4   | 1     | Verification scan mismatch          | Data doesn't match       |
| 1414     | 15  | 1     | File transfer signal                | Signal transfer complete |

### **Control Signals**

| Register | Bit | Value | Meaning           | Action             |
| -------- | --- | ----- | ----------------- | ------------------ |
| 1410     | 0   | 1     | Start signal      | Begin cycle        |
| 1410     | 3   | 1     | Transfer complete | File transfer done |
| 1415     | 7   | 1     | Final check reset | Reset detected     |
| 1600     | 0   | 1     | Reset signal      | Emergency reset    |
| 1500     | 3   | 1     | Reset bits        | Reset PLC bits     |

### **Safety Monitoring**

| Register | Bit | Value | Meaning        | Action           |
| -------- | --- | ----- | -------------- | ---------------- |
| 1490     | 0   | 1     | Part present   | Normal operation |
| 1490     | 1   | 1     | Emergency stop | Safety violation |
| 1490     | 2   | 1     | Safety sensor  | Normal operation |

---

## 🎯 Mental Model for AI Agents

**Think of executeScanCycle as a manufacturing assembly line:**

1. **Quality Gate 1**: First scan checks if part is already marked
2. **Production Step**: Generate and write barcode data
3. **Transfer Step**: Signal file transfer to marking system
4. **Quality Gate 2**: Verification scan checks marking quality
5. **Final Inspection**: Final checks and cycle completion

**Each step can fail independently, but the system continues with appropriate error handling and logging.**

**Reset signals act as emergency stops that can interrupt any step and restart the entire process.**

**The function is designed to be resilient - it logs everything, handles errors gracefully, and provides detailed feedback for debugging.**
