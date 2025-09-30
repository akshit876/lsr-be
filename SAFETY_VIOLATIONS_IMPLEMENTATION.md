# Safety Violations Implementation

## 🚨 Overview

Safety violation monitoring has been implemented in the laser marking system to ensure safe operation by continuously monitoring critical safety conditions from PLC register 1490.

## 🔧 Implementation Details

### Safety Register Monitoring

- **Register**: 1490
- **Monitoring Frequency**: Every 500ms
- **Integration**: Added to `singleCheckAttempt` method in `services/scanCycles.js`

### Safety Conditions Monitored

#### 1. Part Not Present (1490.0)

- **Bit**: 1490.0
- **Condition**: When bit = 1 (part not present)
- **Action**:
  - Log safety violation error
  - Emit UI event
  - Stop current cycle
  - Return "safety_violation" status

#### 2. Emergency Stop (1490.1)

- **Bit**: 1490.1
- **Condition**: When bit = 1 (emergency stop activated)
- **Action**:
  - Log safety violation error
  - Emit UI event
  - Stop current cycle
  - Return "safety_violation" status

#### 3. Safety Sensor Not Engaged (1490.2)

- **Bit**: 1490.2
- **Condition**: When bit = 1 (safety sensor not engaged)
- **Action**:
  - Log safety violation error
  - Emit UI event
  - Stop current cycle
  - Return "safety_violation" status

## 📍 Integration Points

### 1. `singleCheckAttempt` Method

- Added safety check interval that runs every 500ms
- Monitors all three safety conditions in parallel
- Immediately stops cycle on any safety violation

### 2. `checkResetOrBit` Method

- Updated to handle "safety_violation" return value
- Returns "safety_violation" status to calling methods

### 3. `executeScanCycle` Method

- Added safety violation handling after start signal check (1410.0)
- Added safety violation handling after file transfer signal (1410.3)

### 4. `performFinalChecks` Method

- Added safety violation handling during final checks (1415.7)

## 🎯 Safety Violation Flow

```
1. Safety Check Interval (500ms)
   ↓
2. Read Safety Bits (1490.0, 1490.1, 1490.2)
   ↓
3. Check Each Condition
   ↓
4. If Violation Detected:
   - Log Error Message
   - Emit UI Event
   - Cleanup Intervals
   - Return "safety_violation"
   ↓
5. Cycle Stops Immediately
```

## 📡 UI Events

When a safety violation is detected, the system emits a `safety_violation` event to the UI with the following data:

```javascript
{
  timestamp: "2025-09-30T01:46:48.077Z",
  violation: "Part not present" | "Emergency stop activated" | "Safety sensor not engaged",
  cycleNumber: 123,
  register: "1490.0" | "1490.1" | "1490.2",
  value: true
}
```

## 🔍 Log Messages

### Safety Violation Logs

- `🚨 SAFETY VIOLATION: Part not present (1490.0 = 1)`
- `🚨 SAFETY VIOLATION: Emergency stop activated (1490.1 = 1)`
- `🚨 SAFETY VIOLATION: Safety sensor not engaged (1490.2 = 1)`

### Cycle Stop Logs

- `🚨 Safety violation detected, stopping cycle`
- `🚨 Safety violation detected while waiting for 1410.3, stopping cycle`
- `🚨 Safety violation detected at final step, stopping cycle`

## ✅ Benefits

1. **Real-time Safety Monitoring**: Continuous monitoring every 500ms
2. **Immediate Response**: Cycle stops immediately on safety violation
3. **UI Integration**: Real-time safety alerts to user interface
4. **Comprehensive Coverage**: Monitors all critical safety conditions
5. **Detailed Logging**: Clear error messages for troubleshooting
6. **Cycle Protection**: Prevents unsafe operations from continuing

## 🔧 Configuration

The safety monitoring is automatically enabled and requires no additional configuration. It uses the existing PLC communication infrastructure to read register 1490.

## 🚀 Usage

Safety violations are automatically monitored during all scan cycles. No additional setup is required - the system will:

1. Monitor safety conditions continuously
2. Stop cycles immediately on violations
3. Log detailed error messages
4. Emit UI events for real-time alerts
5. Prevent unsafe operations from continuing

## 📋 Testing

To test safety violations:

1. **Part Not Present**: Set PLC bit 1490.0 to 1
2. **Emergency Stop**: Set PLC bit 1490.1 to 1
3. **Safety Sensor**: Set PLC bit 1490.2 to 1

The system should immediately detect the violation and stop the current cycle with appropriate logging and UI events.

## 🔍 Troubleshooting

If safety violations are not being detected:

1. Check PLC communication to register 1490
2. Verify bit positions (0, 1, 2) are correct
3. Check log messages for safety check errors
4. Ensure UI is listening for `safety_violation` events

Safety violations are now fully implemented and will protect the system from unsafe operations! 🛡️
