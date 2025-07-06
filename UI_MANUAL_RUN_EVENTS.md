# UI Manual Run Events Configuration

## Socket.IO Events to Send to Backend

### Manual Run Bits Event

```javascript
// Event name: 'manual-run-bits'
// Parameters: { register, bit, value }
// Auto-off: Bits automatically turn OFF after 200ms

// Manual Scan (1481.0) - Creates 200ms pulse
socket.emit("manual-run-bits", { register: 1481, bit: 0, value: 1 });

// Manual Mark On (1480.0) - Creates 200ms pulse
socket.emit("manual-run-bits", { register: 1480, bit: 0, value: 1 });

// Manual Light (1482.0) - Creates 200ms pulse
socket.emit("manual-run-bits", { register: 1482, bit: 0, value: 1 });
```

### Listen for Response

```javascript
socket.on("manualRunBitsSuccess", (data) => {
  console.log("Success:", data.message);
  // data = { register, bit, value, message }
  // Example messages: "Scanner ON", "Mark ON", "Light ON"
});
```

### Listen for Errors

```javascript
socket.on("error", (error) => {
  console.error("Error:", error.message);
});
```

## Quick Implementation Examples

### React Hook

```javascript
const useManualRun = () => {
  const triggerManualRun = (register, bit, value = 1) => {
    socket.emit("manual-run-bits", { register, bit, value });
  };

  return { triggerManualRun };
};
```

### Vue.js Method

```javascript
methods: {
  triggerManualRun(register, bit, value = 1) {
    this.$socket.emit('manual-run-bits', { register, bit, value });
  }
}
```

### Angular Service

```javascript
triggerManualRun(register: number, bit: number, value: number = 1) {
  this.socket.emit('manual-run-bits', { register, bit, value });
}
```
