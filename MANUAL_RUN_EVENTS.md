# Manual Run Bits Event Documentation

## Overview

A single Socket.IO event has been added to the backend for manual run operations that control any PLC bit. This approach is more flexible and allows the UI to specify which bit to control.

## Event

### Manual Run Bits

**Event:** `manual-run-bits`
**Action:** Sets any PLC bit to a specified value
**Response:** `manualRunBitsSuccess`

## Usage

### Frontend Implementation

```javascript
// Set bit 1481.0 to ON (Manual Scan)
socket.emit("manual-run-bits", { register: 1481, bit: 0, value: 1 });

// Set bit 1480.0 to ON (Manual Mark On)
socket.emit("manual-run-bits", { register: 1480, bit: 0, value: 1 });

// Set bit 1482.0 to ON (Manual Light)
socket.emit("manual-run-bits", { register: 1482, bit: 0, value: 1 });

// Listen for success response
socket.on("manualRunBitsSuccess", (data) => {
  console.log("Bit set successfully:", data.message);
  console.log("Register:", data.register);
  console.log("Bit:", data.bit);
  console.log("Value:", data.value);
});
```

### Parameters

- **register** (number, required): The PLC register address
- **bit** (number, required): The bit position within the register (0-15)
- **value** (number, optional): The value to set (default: 1)

### Response Data

```javascript
{
  register: 1481,
  bit: 0,
  value: 1,
  message: "Bit 1481.0 set to 1"
}
```

## Error Handling

The event emits an `error` event if the operation fails:

```javascript
socket.on("error", (error) => {
  console.error("Operation failed:", error.message);
});
```

## Testing

Run the test script to verify the event works:

```bash
node test-manual-run-events.js
```

## Common PLC Bits

- **1481.0** - Manual Scan
- **1480.0** - Manual Mark On
- **1482.0** - Manual Light

## Benefits

- **Flexible**: Can control any PLC bit, not just predefined ones
- **Consistent**: Single event handler for all manual operations
- **Extensible**: Easy to add new bits without backend changes
- **UI-driven**: UI decides which bits to control
