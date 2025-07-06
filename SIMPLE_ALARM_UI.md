# Simple Alarm UI Events

## Overview

When any of the 3 alarm bits becomes ON, a simple `alarm` event is emitted to the UI.

## Monitored Alarms

- **1490.0** - Part not present
- **1490.1** - Emergency stop
- **1490.2** - Safety sensor

## UI Event

### `alarm` Event

Emitted when any alarm bit becomes ON.

**Event Data:**

```javascript
{
  alarm: "emergencyStop", // "partNotPresent", "emergencyStop", "safetySensor"
  description: "Emergency stop",
  message: "Emergency stop alarm activated!"
}
```

## UI Implementation

### Simple JavaScript/React

```javascript
import io from "socket.io-client";

const socket = io("http://localhost:3002");

// Listen for alarm events
socket.on("alarm", (alarmData) => {
  console.log("🚨 Alarm:", alarmData.message);

  // Show notification to user
  showNotification(alarmData.message, "error");
});

function showNotification(message, type) {
  // Your notification logic here
  alert(message); // Simple example
}
```

### Simple Vue.js

```javascript
// In your Vue component
export default {
  mounted() {
    this.$socket.on("alarm", this.handleAlarm);
  },

  methods: {
    handleAlarm(alarmData) {
      this.$notify({
        type: "error",
        title: "Alarm",
        message: alarmData.message,
      });
    },
  },
};
```

## Testing

1. Start your application
2. When PLC is waiting for bits, manually activate:
   - **1490.0** - Part not present
   - **1490.1** - Emergency stop
   - **1490.2** - Safety sensor
3. Check your UI for the alarm notification

That's it! Simple alarm system that just emits one event when alarms are detected.
