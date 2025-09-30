# Part Already Marked Feature

## 🏷️ Overview

The "Part Already Marked" feature detects when a part has already been marked during the first scan and provides comprehensive UI notifications and logging to inform operators about this condition.

## 🔧 Implementation

### Detection Logic

- **Trigger**: When first scan receives data (non-empty, non-"NG" response)
- **Location**: `handleFirstScan` method in `services/scanCycles.js`
- **Action**: Emits UI events and continues workflow for re-marking

### UI Events Emitted

#### `first_scan_ok` Event (with part already marked flag)

```javascript
{
  timestamp: Date,
  data: "detected_marking_data",
  message: "Part already marked - data detected on first scan",
  cycleNumber: 123,
  scanType: "first",
  isAlreadyMarked: true,
  warning: true,
  details: {
    detectedData: "detected_marking_data",
    scanPosition: "first_scan",
    workflowStatus: "continuing",
    reason: "part_may_need_re_marking",
    timestamp: "2025-09-30T01:46:48.077Z"
  }
}
```

## 📋 Workflow Behavior

### When Part Already Marked is Detected:

1. **Detection**: First scan receives data (non-empty response)
2. **Logging**: Warning messages logged to console
3. **UI Notifications**: `first_scan_ok` event emitted with `isAlreadyMarked: true`
4. **PLC Signal**: Bit 1414.7 written to signal NG scan
5. **Cycle Control**: **Stops current cycle and restarts** for re-marking

### Log Messages

```
⚠️ First scan received data - part appears to be already marked
📋 Received data: "ABC123"
🏷️ PART ALREADY MARKED: Data detected on first scan
📋 Marking data found: "ABC123"
🔄 Stopping cycle - part already marked, will restart for re-marking
📊 Cycle: 123, Scan: first, Data: "ABC123"
✍️ Writing bit 1414.7 to signal NG scan (part already marked)
🔄 Stopping current cycle - part already marked, will restart
```

## 🎯 UI Integration

### Frontend Event Listeners

```javascript
// Listen for first scan events (including part already marked)
socket.on("first_scan_ok", (data) => {
  if (data.isAlreadyMarked) {
    console.log("Part already marked:", data);
    showPartAlreadyMarkedAlert(data);
  } else {
    // Normal first scan handling
    console.log("First scan successful:", data);
  }
});
```

### UI Components to Implement

1. **Alert Dialog**: Show when part already marked is detected
2. **Notification Toast**: Persistent warning notification
3. **Scan Status Indicator**: Visual indicator of part already marked
4. **Details Panel**: Show detected marking data and options

## 🔧 Configuration

### Method: `handlePartAlreadyMarked(scannerData, scanType)`

**Parameters:**

- `scannerData`: The detected marking data
- `scanType`: Type of scan (default: "first")

**Features:**

- Comprehensive UI event emission
- Detailed logging
- Configurable scan type
- Rich notification data

## 📊 Benefits

1. **Operator Awareness**: Clear notifications when parts are already marked
2. **Data Visibility**: Shows exactly what marking data was detected
3. **Cycle Management**: Stops current cycle and restarts for proper re-marking
4. **Audit Trail**: Detailed logging for quality control
5. **UI Integration**: Uses existing `first_scan_ok` event with warning flags

## 🚀 Usage Examples

### Basic Detection

```javascript
// In handleFirstScan method
if (scannerData && scannerData.trim() !== "") {
  await this.handlePartAlreadyMarked(scannerData, "first");
  await writeBit(1414, 7, 1);
}
```

### Custom Scan Type

```javascript
// For other scan types
await this.handlePartAlreadyMarked(scannerData, "verification");
```

## 🔍 Testing

### Test Scenarios

1. **Valid Data Detection**:

   - Send non-empty data to first scan
   - Verify UI events are emitted
   - Check log messages

2. **Empty Data**:

   - Send empty/null data
   - Verify no part already marked events

3. **NG Response**:
   - Send "NG" response
   - Verify normal NG handling

### Test Data Examples

- `"ABC123"` - Valid marking data
- `"123456789"` - Numeric marking data
- `"PART-001"` - Alphanumeric marking data

## 📈 Monitoring

### Key Metrics to Track

- Frequency of part already marked detections
- Types of marking data detected
- Cycle numbers where detections occur
- Operator response to notifications

### Log Analysis

- Search for "PART ALREADY MARKED" in logs
- Monitor UI event emission frequency
- Track workflow continuation success

## 🛠️ Troubleshooting

### Common Issues

1. **Events Not Emitted**:

   - Check if `this.io` is available
   - Verify socket connection

2. **UI Not Responding**:

   - Check event listener setup
   - Verify event names match

3. **Logging Issues**:
   - Check logger configuration
   - Verify log levels

### Debug Steps

1. Check console for warning messages
2. Verify UI event listeners are active
3. Test with known marking data
4. Monitor network events in browser dev tools

The Part Already Marked feature is now fully implemented and ready for use! 🏷️✨
