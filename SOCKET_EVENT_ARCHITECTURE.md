# Socket Event Architecture for Parallel Event Handling

## Overview

This document describes the new architecture implemented to ensure **parallelism and concurrency** between socket events (manual controls, job controls) and the main cycle execution. The goal is to have these events trigger specific bits in the PLC without impacting the running cycle.

## Architecture Principles

### 1. **Separation of Concerns**

- **Main Cycle**: Handles continuous scanning, data processing, and cycle management
- **Socket Events**: Handle manual controls, job controls, and PLC operations independently
- **No Blocking**: Socket events never block or interfere with the main cycle execution

### 2. **Parallel Processing**

- Socket events are processed in parallel with the main cycle
- Each event handler runs independently and asynchronously
- Events can occur at any time without cycle interruption

### 3. **PLC Bit Operations**

- Events trigger specific bits in the PLC backside
- Operations are atomic and non-blocking
- Immediate response to UI requests

## Implementation

### SocketEventService

The `SocketEventService` is a dedicated service that handles all socket events independently:

```javascript
// services/socketEventService.js
class SocketEventService {
  // Handles manual run operations
  async handleManualRun(socket, operation)

  // Handles scanner trigger
  async handleScannerTrigger(socket)

  // Handles mark on
  async handleMarkOn(socket)

  // Handles light on
  async handleLightOn(socket)

  // Handles servo setting changes
  async handleServoSettingChange(socket, data)

  // Handles job control events
  async handleJobControl(socket, jobType, action)

  // Generic PLC bit operations
  async handlePlcBitOperation(socket, { address, bit, value, operation })

  // Generic PLC register operations
  async handlePlcRegisterOperation(socket, { address, value, operation })
}
```

### Event Flow

```
UI Event → Socket → SocketEventService → PLC Operation → Response
   ↓
Main Cycle (unaffected, continues running)
```

## Available Socket Events

### 1. **Manual Controls**

- `scanner_trigger` - Triggers scanner (sets bit 1481.0)
- `mark_on` - Activates marking (sets bit 1480.0)
- `light_on` - Activates light (sets bit 1482.0)
- `manual-run` - Executes manual run operations

### 2. **Servo Settings**

- `servo-setting-change` - Updates servo positions and speeds
  - `homePosition` - Home position and speed
  - `scannerPosition` - Scanner position and speed
  - `ocrPosition` - OCR position and speed
  - `markPosition` - Mark position and speed
  - `fwdEndLimit` - Forward end limit
  - `revEndLimit` - Reverse end limit

### 3. **Job Controls**

- `job-control` - Generic job control operations
  - `jobType`: Type of job to control
  - `action`: Action to perform (start, stop, pause, resume)

### 4. **Generic PLC Operations**

- `plc-bit-operation` - Generic bit operations

  - `address`: PLC register address
  - `bit`: Bit number
  - `value`: Bit value (0 or 1)
  - `operation`: Operation description

- `plc-register-operation` - Generic register operations
  - `address`: PLC register address
  - `value`: Register value
  - `operation`: Operation description

### 5. **Service Status**

- `get-event-service-status` - Get service health and status

## PLC Register Mapping

### Manual Control Bits (Register 1414)

- Bit 0: Marking Start
- Bit 1: Scanner Trigger
- Bit 2: OCR Trigger
- Bit 3: Work Light
- Bit 4: Servo Home Position
- Bit 5: Servo Scanner Position
- Bit 6: Servo OCR Position
- Bit 7: Servo Mark Position
- Bit 8: Jog Forward
- Bit 9: Jog Reverse
- Bit 10: Servo Home

### UI Control Bits

- Bit 1480.0: Mark On
- Bit 1481.0: Scanner Trigger
- Bit 1482.0: Light On

### Servo Position Registers

- Register 550: Home Position
- Register 552: Scanner Position
- Register 554: OCR Position
- Register 556: Mark Position
- Register 574: Forward End Limit
- Register 578: Reverse End Limit

### Servo Speed Registers

- Register 560: Home Speed
- Register 562: Scanner Speed
- Register 564: OCR Speed
- Register 566: Mark Speed

## Benefits of New Architecture

### 1. **Non-Blocking Operations**

- Main cycle continues uninterrupted
- Socket events process independently
- No performance impact on scanning operations

### 2. **Immediate Response**

- UI controls respond instantly
- PLC bits are set immediately
- Real-time feedback to operators

### 3. **Scalability**

- Easy to add new event types
- Modular event handling
- Independent service scaling

### 4. **Error Isolation**

- Event failures don't affect main cycle
- Individual error handling per event
- Graceful degradation

### 5. **Maintenance**

- Clear separation of responsibilities
- Easy to debug event issues
- Independent testing capabilities

## Usage Examples

### Frontend Event Emission

```javascript
// Scanner trigger
socket.emit("scanner_trigger");

// Manual run operation
socket.emit("manual-run", "markingStart");

// Servo setting change
socket.emit("servo-setting-change", {
  setting: "homePosition",
  value: { position: 100.5 },
});

// Job control
socket.emit("job-control", {
  jobType: "production",
  action: "pause",
});

// Generic PLC operation
socket.emit("plc-bit-operation", {
  address: 1500,
  bit: 5,
  value: 1,
  operation: "custom_operation",
});
```

### Event Response Handling

```javascript
// Success responses
socket.on("scanner_trigger_success", (data) => {
  console.log("Scanner triggered:", data);
});

socket.on("manualRunSuccess", (data) => {
  console.log("Manual run completed:", data);
});

socket.on("servo-setting-change-response", (data) => {
  console.log("Servo setting updated:", data);
});

// Error handling
socket.on("error", (error) => {
  console.error("Operation failed:", error);
});
```

## Configuration

### Environment Variables

- `MODBUS_IP`: PLC IP address
- `MODBUS_PORT`: PLC port number
- `PORT`: Server port (default: 3002)

### Service Initialization

The `SocketEventService` is automatically initialized when the server starts:

```javascript
// In server.js startup
await socketEventService.initialize();
logger.info("SocketEventService initialized for parallel event handling");
```

## Monitoring and Debugging

### Service Status

```javascript
socket.emit("get-event-service-status");
socket.on("event-service-status", (status) => {
  console.log("Service status:", status);
});
```

### Logging

All events are logged with:

- Event type and source
- Client ID
- Operation details
- Success/failure status
- Timestamps

### Error Handling

- Comprehensive error logging
- Client-specific error responses
- Graceful failure handling
- No impact on main cycle

## Future Enhancements

### 1. **Event Queuing**

- Queue management for high-frequency events
- Priority-based event processing
- Rate limiting for PLC operations

### 2. **Event Validation**

- Input validation and sanitization
- PLC register range checking
- Operation permission validation

### 3. **Event History**

- Event audit trail
- Performance metrics
- Usage analytics

### 4. **Advanced Job Controls**

- Job scheduling
- Batch operations
- Conditional execution

## Conclusion

This architecture ensures that manual controls and job operations can occur at any time without impacting the main cycle execution. The separation of concerns provides:

- **Reliability**: Main cycle is never interrupted
- **Responsiveness**: Immediate UI feedback
- **Maintainability**: Clear code organization
- **Scalability**: Easy to extend and modify

The system maintains full parallelism and concurrency while ensuring all PLC operations are executed reliably and efficiently.
