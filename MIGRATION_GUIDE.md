# Migration Guide: Old Scan System → New Clean Architecture

## Overview

This guide helps you migrate from the old, race-condition-prone scan system to the new clean architecture implementation.

## Key Improvements

### 1. **Eliminated Race Conditions**

- **Old**: Multiple `setInterval` and `setTimeout` calls without proper cleanup
- **New**: Centralized signal monitoring with proper cleanup and state management

### 2. **Clean State Management**

- **Old**: Complex state tracking with multiple variables and flags
- **New**: State machine pattern with clear transitions and validation

### 3. **Proper Error Handling**

- **Old**: Inconsistent error handling and recovery
- **New**: Centralized error handling with proper state recovery

### 4. **Modular Design**

- **Old**: Monolithic `scanCycles.js` with 2000+ lines
- **New**: Modular classes with single responsibilities

## Architecture Comparison

### Old System

```
scanCycles.js (2000+ lines)
├── Complex state management
├── Multiple race conditions
├── Inconsistent error handling
└── Hard to maintain and debug
```

### New System

```
ScanCycleManager.js
├── BitReader (PLC communication)
├── ScanCycleStateMachine (State management)
├── PLCSignalMonitor (Signal monitoring)
└── ScanCycleManager (Main orchestrator)
```

## Migration Steps

### Step 1: Test the New System

1. **Run the test suite**:

   ```bash
   node test-new-scan-system.js
   ```

2. **Start the new server**:

   ```bash
   node server-new.js
   ```

3. **Test the API endpoints**:
   - `GET /health` - Health check
   - `GET /status` - System status
   - `POST /start` - Start scan cycles
   - `POST /stop` - Stop scan cycles

### Step 2: Compare Behavior

The new system should:

- ✅ Start cycles without hanging
- ✅ Handle multiple cycles correctly
- ✅ Clear bits properly between cycles
- ✅ Handle errors gracefully
- ✅ Provide clear status information

### Step 3: Gradual Migration

1. **Keep old system running** for comparison
2. **Test new system** in parallel
3. **Compare logs** and behavior
4. **Switch over** when confident

## Key Differences

### PLC Register Management

**Old System**:

```javascript
// Scattered throughout code
await writeBit(1414, 3, 1);
await writeBit(1414, 4, 0);
// ... many more scattered calls
```

**New System**:

```javascript
// Centralized configuration
export const PLC_REGISTERS = {
  STATUS: {
    DATA_MATCH_OK: { register: 1414, bit: 3 },
    DATA_MATCH_NG: { register: 1414, bit: 4 },
    // ... all registers defined in one place
  },
};

// Clean usage
await this.bitReader.writeBit(
  PLC_REGISTERS.STATUS.DATA_MATCH_OK.register,
  PLC_REGISTERS.STATUS.DATA_MATCH_OK.bit,
  1
);
```

### Signal Monitoring

**Old System**:

```javascript
// Complex, error-prone implementation
const bitCheckInterval = setInterval(async () => {
  // ... complex logic with race conditions
}, 100);
```

**New System**:

```javascript
// Clean, race-condition-free implementation
const result = await this.signalMonitor.waitForSignal(
  register,
  bit,
  value,
  timeout
);
```

### State Management

**Old System**:

```javascript
// Multiple variables tracking state
let isWaiting = false;
let isProcessing = false;
let currentStep = "idle";
// ... many more state variables
```

**New System**:

```javascript
// Clean state machine
this.stateMachine.transition(ScanCycleState.WAITING_FOR_START);
const currentState = this.stateMachine.getCurrentState();
```

## Configuration

### Environment Variables

The new system uses the same environment variables as the old system:

- `PLC_HOST` - PLC IP address
- `PLC_PORT` - PLC port
- `PLC_UNIT_ID` - PLC unit ID

### PLC Register Configuration

All PLC registers are now defined in `PLC_REGISTERS` constant:

```javascript
export const PLC_REGISTERS = {
  CONTROL: {
    START_SIGNAL: { register: 1410, bit: 0 },
    SCANNER_TRIGGER: { register: 1410, bit: 3 },
    // ... more control registers
  },
  STATUS: {
    DATA_MATCH_OK: { register: 1414, bit: 3 },
    DATA_MATCH_NG: { register: 1414, bit: 4 },
    // ... more status registers
  },
  // ... more register categories
};
```

## Troubleshooting

### Common Issues

1. **"PLC not connected" errors**

   - Check PLC connection settings
   - Verify PLC is running and accessible

2. **"Signal timeout" errors**

   - Check if PLC is setting the expected bits
   - Verify register addresses are correct

3. **"State transition" errors**
   - Check if the state machine is in the correct state
   - Verify the transition is valid

### Debug Mode

Enable debug logging by setting the log level:

```javascript
// In logger.js
const logLevel = "debug"; // Change from 'info' to 'debug'
```

## Performance Improvements

### Memory Usage

- **Old**: High memory usage due to multiple intervals and timeouts
- **New**: Low memory usage with proper cleanup

### CPU Usage

- **Old**: High CPU usage due to continuous polling
- **New**: Efficient event-driven architecture

### Reliability

- **Old**: Frequent hangs and race conditions
- **New**: Stable operation with proper error handling

## Rollback Plan

If you need to rollback to the old system:

1. **Stop the new server**: `Ctrl+C`
2. **Start the old server**: `node server.js`
3. **Check logs** for any issues
4. **Report problems** for further fixes

## Support

For issues or questions:

1. Check the logs for error messages
2. Run the test suite to identify problems
3. Compare with the old system behavior
4. Report specific error messages and scenarios

## Next Steps

After successful migration:

1. **Monitor performance** for a few days
2. **Collect feedback** from users
3. **Optimize** based on real-world usage
4. **Add new features** using the clean architecture

The new system provides a solid foundation for future enhancements and maintenance.
