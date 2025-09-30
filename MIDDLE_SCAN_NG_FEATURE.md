# Middle Scan NG (No Code Found) Feature

## 🔍 Overview

The "Middle Scan NG" feature handles the scenario when the middle scanner fails to detect any marking code during the middle scan phase. When this occurs, the system stops the current cycle and restarts it, while emitting a "no code found" event to the UI.

## 🔧 Implementation

### Detection Logic

- **Trigger**: When middle scan receives "NG", null, undefined, or empty response
- **Location**: `handleMiddleScan` method in `services/scanCycles.js`
- **Action**: Stops cycle and emits UI event for no code found

### UI Events Emitted

#### `no_code_found` Event

```javascript
{
  timestamp: Date,
  scanType: "middle",
  message: "No code found during middle scan",
  cycleNumber: 456,
  severity: "error",
  action: "restart_cycle",
  details: {
    scanPosition: "middle_scan",
    workflowStatus: "stopped",
    reason: "no_marking_code_detected",
    timestamp: "2025-09-30T01:46:48.077Z"
  }
}
```

## 📋 Workflow Behavior

### When No Code Found is Detected:

1. **Detection**: Middle scan receives NG, null, undefined, or empty response
2. **Logging**: Warning messages logged to console
3. **UI Notifications**: `no_code_found` event emitted with error severity
4. **Database**: NG data saved to MongoDB for audit trail
5. **Cycle Control**: **Stops current cycle and restarts** for retry

### Log Messages

```
⚠️ Middle scan data is NG or timeout - no code found
📡 Emitting no code found event to UI...
💾 Saving NG data to MongoDB...
🔄 Stopping current cycle - no code found, will restart
```

## 🎯 UI Integration

### Frontend Event Listeners

```javascript
// Listen for no code found events
socket.on("no_code_found", (data) => {
  console.log("No code found:", data);
  showNoCodeFoundAlert(data);
  // Handle cycle restart UI updates
});
```

### UI Components to Implement

1. **Error Alert**: Show when no code is found during middle scan
2. **Cycle Status**: Update UI to show cycle restart
3. **Retry Indicator**: Visual feedback for retry attempt
4. **Error Details**: Show scan position and reason

## 🔧 Configuration

### Method: `handleMiddleScan()`

**NG Detection Conditions:**

- `scannerData` is null or undefined
- `scannerData.trim()` is empty string
- `scannerData.trim().toUpperCase() === "NG"`

**Features:**

- Comprehensive UI event emission
- Database logging for audit trail
- Cycle restart mechanism
- Error severity classification

## 📊 Benefits

1. **Error Handling**: Proper handling of scanner failures
2. **User Feedback**: Clear UI notifications for no code found
3. **Cycle Management**: Automatic cycle restart for retry
4. **Audit Trail**: Database logging for quality control
5. **System Reliability**: Prevents workflow continuation with invalid data

## 🚀 Usage Examples

### Basic NG Detection

```javascript
// In handleMiddleScan method
if (!scannerData || scannerData.trim().toUpperCase() === "NG") {
  // Emit no code found event
  this.io.emit("no_code_found", {
    /* event data */
  });

  // Save to database
  await this.saveToMongoDB({
    /* NG data */
  });

  // Stop cycle and restart
  return { shouldContinue: false, markingData: "NG" };
}
```

### Frontend Handling

```javascript
socket.on("no_code_found", (data) => {
  if (data.severity === "error") {
    showErrorAlert("No code found during middle scan");
    updateCycleStatus("restarting");
  }
});
```

## 🔍 Testing

### Test Scenarios

1. **NG Response**:

   - Send "NG" response to middle scan
   - Verify cycle stops and UI event emitted

2. **Null Response**:

   - Send null response
   - Verify same behavior as NG

3. **Empty String**:

   - Send empty string response
   - Verify same behavior as NG

4. **Timeout**:
   - Simulate scanner timeout
   - Verify proper error handling

### Test Data Examples

- `"NG"` - Explicit NG response
- `null` - Null response
- `undefined` - Undefined response
- `""` - Empty string response
- `"   "` - Whitespace-only response

## 📈 Monitoring

### Key Metrics to Track

- Frequency of no code found detections
- Middle scan failure rate
- Cycle restart frequency
- Scanner reliability metrics

### Log Analysis

- Search for "no code found" in logs
- Monitor middle scan failure patterns
- Track cycle restart events
- Analyze scanner performance

## 🛠️ Troubleshooting

### Common Issues

1. **Events Not Emitted**:

   - Check if `this.io` is available
   - Verify socket connection

2. **Cycle Not Restarting**:

   - Check `shouldContinue: false` return value
   - Verify main scan cycle logic

3. **Database Not Saving**:
   - Check MongoDB connection
   - Verify `saveToMongoDB` method

### Debug Steps

1. Check console for warning messages
2. Verify UI event listeners are active
3. Test with known NG responses
4. Monitor database for NG entries

## 🔄 Cycle Flow

```
Middle Scan → No Code Found → Stop Cycle → Restart New Cycle
```

The Middle Scan NG feature ensures proper error handling and cycle management when no marking code is detected during the middle scan phase! 🔍✨
