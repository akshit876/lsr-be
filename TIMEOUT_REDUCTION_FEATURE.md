# Timeout Reduction Feature

## ⏰ Overview

The "Timeout Reduction" feature reduces the scanner timeout for first and middle scans from 30 seconds to 2 seconds, allowing for faster detection of "part already marked" and "no code found" conditions, and quicker cycle restarts.

## 🔧 Implementation

### Timeout Configuration

- **First Scan**: 2 seconds (reduced from 30 seconds)
- **Middle Scan**: 2 seconds (reduced from 30 seconds)
- **Verification Scan**: 30 seconds (unchanged)
- **Other Scans**: 30 seconds (unchanged)

### Code Changes

```javascript
// In fetchScannerData method
timeout =
  scanType === "first" || scanType === "middle" ? 2000 : SCANNER_TIMEOUT;
```

## 📋 Benefits

### 1. **Faster Error Detection**

- Part already marked: Detected in ~2 seconds instead of 30 seconds
- No code found: Detected in ~2 seconds instead of 30 seconds

### 2. **Quicker Cycle Restarts**

- Cycle stops and restarts much faster
- Reduces overall system downtime
- Improves operator experience

### 3. **Better User Experience**

- Faster feedback to operators
- Reduced waiting time for error conditions
- More responsive system behavior

## 🔄 Workflow Impact

### Before Timeout Reduction:

```
First Scan → Wait up to 30s → Detect Part Already Marked → Stop Cycle → Restart
Middle Scan → Wait up to 30s → Detect No Code Found → Stop Cycle → Restart
```

### After Timeout Reduction:

```
First Scan → Wait up to 2s → Detect Part Already Marked → Stop Cycle → Restart
Middle Scan → Wait up to 2s → Detect No Code Found → Stop Cycle → Restart
```

## 🎯 Use Cases

### Part Already Marked

- **Trigger**: First scan receives data (non-empty response)
- **Timeout**: 2 seconds maximum wait
- **Action**: Immediate cycle stop and restart

### No Code Found

- **Trigger**: Middle scan receives "NG", null, or empty response
- **Timeout**: 2 seconds maximum wait
- **Action**: Immediate cycle stop and restart

## 🔍 Technical Details

### Scan Type Detection

```javascript
const isFirstOrMiddleScan = scanType === "first" || scanType === "middle";
const timeout = isFirstOrMiddleScan ? 2000 : SCANNER_TIMEOUT;
```

### Timeout Values

- `2000` = 2 seconds (first/middle scans)
- `SCANNER_TIMEOUT` = 30 seconds (other scans)

## 📊 Performance Impact

### Time Savings

- **Part Already Marked**: 28 seconds saved per occurrence
- **No Code Found**: 28 seconds saved per occurrence
- **Normal Operation**: No impact (still 2 seconds for successful scans)

### System Responsiveness

- Faster error recovery
- Reduced operator wait time
- Improved cycle throughput

## 🚀 Usage Examples

### Normal Operation

```javascript
// First scan with valid data
const firstScanResult = await this.handleFirstScan(tcpScannerService);
// Returns within 2 seconds if data is received

// Middle scan with valid data
const middleScanResult = await this.handleMiddleScan();
// Returns within 2 seconds if data is received
```

### Error Conditions

```javascript
// Part already marked - detected in ~2 seconds
if (scannerData && scannerData.trim() !== "") {
  await this.handlePartAlreadyMarked(scannerData, "first");
  return { shouldContinue: false }; // Immediate cycle stop
}

// No code found - detected in ~2 seconds
if (!scannerData || scannerData.trim().toUpperCase() === "NG") {
  this.io.emit("no_code_found", {
    /* event data */
  });
  return { shouldContinue: false }; // Immediate cycle stop
}
```

## 🔍 Testing

### Test Scenarios

1. **First Scan Timeout**:

   - Verify 2-second timeout for first scan
   - Test with part already marked detection

2. **Middle Scan Timeout**:

   - Verify 2-second timeout for middle scan
   - Test with no code found detection

3. **Verification Scan Timeout**:
   - Verify 30-second timeout unchanged
   - Test normal verification workflow

### Test Data Examples

- **Part Already Marked**: `"ABC123"`, `"PART-001"`, `"SERIAL-2025"`
- **No Code Found**: `"NG"`, `null`, `""`, `undefined`
- **Valid Data**: `"VALID_CODE"`, `"123456789"`

## 📈 Monitoring

### Key Metrics to Track

- Average scan completion time
- Error detection speed
- Cycle restart frequency
- System responsiveness

### Log Analysis

- Monitor timeout messages in logs
- Track scan duration metrics
- Analyze error detection speed
- Measure cycle restart times

## 🛠️ Troubleshooting

### Common Issues

1. **Scans Still Taking 30 Seconds**:

   - Check scan type parameter
   - Verify timeout configuration
   - Check for other delays in workflow

2. **Too Fast Timeout**:
   - Verify scanner connectivity
   - Check data transmission speed
   - Adjust timeout if needed

### Debug Steps

1. Check console for timeout messages
2. Verify scan type in logs
3. Monitor scan duration metrics
4. Test with different scan types

## 🔄 Configuration

### Customizing Timeouts

```javascript
// To modify timeout values
const FIRST_MIDDLE_TIMEOUT = 2000; // 2 seconds
const OTHER_SCAN_TIMEOUT = 30000; // 30 seconds

timeout =
  scanType === "first" || scanType === "middle"
    ? FIRST_MIDDLE_TIMEOUT
    : OTHER_SCAN_TIMEOUT;
```

### Environment Variables

```javascript
// Could be made configurable via environment
const FIRST_MIDDLE_TIMEOUT = process.env.FIRST_MIDDLE_TIMEOUT || 2000;
const OTHER_SCAN_TIMEOUT = process.env.OTHER_SCAN_TIMEOUT || 30000;
```

The Timeout Reduction feature significantly improves system responsiveness for error conditions while maintaining normal operation performance! ⏰✨
