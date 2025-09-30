# Alarm Service Documentation

## 🚨 Overview

The Alarm Service is a dedicated, independent service that continuously monitors PLC safety registers and emits real-time alarm events via Socket.IO. This provides immediate safety violation detection without depending on scan cycle states.

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PLC System    │    │  Alarm Service  │    │   UI Clients    │
│                 │    │   (Port 3001)   │    │                 │
│ 1490.0 - Part   │◄───┤                 ├───►│ Socket.IO       │
│ 1490.1 - E-Stop │    │ Continuous      │    │ Listeners       │
│ 1490.2 - Safety │    │ Monitoring      │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### 1. Run Alarm Service Independently

```bash
# Start alarm service only
npm run alarm

# Or run directly
node alarm-service.js
```

### 2. Run with Main Application

```bash
# Start main app (includes alarm service)
npm start
```

### 3. Test with Client

```bash
# Run example client
npm run alarm-client
```

## 📡 Socket.IO Events

### Client → Server Events

| Event                  | Description                  | Data |
| ---------------------- | ---------------------------- | ---- |
| `request_alarm_status` | Request current alarm status | None |

### Server → Client Events

| Event              | Description               | Data                                             |
| ------------------ | ------------------------- | ------------------------------------------------ |
| `safety_violation` | Safety violation detected | `{violation, register, value, severity, action}` |
| `alarm_triggered`  | Alarm triggered           | `{alarmType, severity, data}`                    |
| `alarm_cleared`    | All alarms cleared        | `{message, timestamp}`                           |
| `alarm_status`     | Current alarm status      | `{status, activeAlarms, alarms}`                 |
| `alarm_error`      | Connection/PLC error      | `{error, message}`                               |

## 🔧 Configuration

### Alarm Service Port

```javascript
// Default port 3001
const alarmService = new AlarmService(3001);

// Custom port
const alarmService = new AlarmService(3002);
```

### Monitoring Interval

```javascript
// Check every 500ms (default)
setInterval(checkAlarms, 500);
```

### PLC Registers Monitored

- **1490.0**: Part not present (1 = violation)
- **1490.1**: Emergency stop activated (1 = violation)
- **1490.2**: Safety sensor not engaged (1 = violation)

## 💻 Client Integration

### Basic Connection

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

socket.on("connect", () => {
  console.log("Connected to Alarm Service");
});

socket.on("safety_violation", (data) => {
  console.log("Safety violation:", data.violation);
  // Handle alarm in your UI
});
```

### React Integration

```jsx
import { useEffect, useState } from "react";
import { io } from "socket.io-client";

function AlarmComponent() {
  const [alarms, setAlarms] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io("http://localhost:3001");

    newSocket.on("safety_violation", (data) => {
      setAlarms((prev) => [...prev, data]);
    });

    newSocket.on("alarm_cleared", () => {
      setAlarms([]);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  return (
    <div>
      {alarms.map((alarm, index) => (
        <div key={index} className="alarm">
          🚨 {alarm.violation}
        </div>
      ))}
    </div>
  );
}
```

### Vue.js Integration

```vue
<template>
  <div>
    <div v-for="alarm in alarms" :key="alarm.timestamp" class="alarm">
      🚨 {{ alarm.violation }}
    </div>
  </div>
</template>

<script>
import { io } from "socket.io-client";

export default {
  data() {
    return {
      alarms: [],
      socket: null,
    };
  },
  mounted() {
    this.socket = io("http://localhost:3001");

    this.socket.on("safety_violation", (data) => {
      this.alarms.push(data);
    });

    this.socket.on("alarm_cleared", () => {
      this.alarms = [];
    });
  },
  beforeUnmount() {
    if (this.socket) {
      this.socket.close();
    }
  },
};
</script>
```

## 📊 Event Data Structures

### safety_violation Event

```javascript
{
  timestamp: "2025-09-30T10:51:05.000Z",
  violation: "Part not present",
  cycleNumber: 0,
  register: "1490.0",
  value: true,
  severity: "critical",
  action: "stop_cycle",
  alarmType: "part_not_present"
}
```

### alarm_status Event

```javascript
{
  timestamp: "2025-09-30T10:51:05.000Z",
  status: "alarm_active", // or "normal"
  activeAlarms: ["part_not_present"],
  alarms: {
    partPresent: true,
    emergencyStop: false,
    safetySensor: false
  }
}
```

## 🔍 Monitoring & Debugging

### Log Messages

```
🔍 Alarm Check: partPresent=false, emergencyStop=false, safetySensor=false
🚨 ALARM: Part not present
📡 Client connected to Alarm Service: abc123
📊 Status: Running=true, Clients=2, Alarms={"partPresent":false}
```

### Health Check

```javascript
// Get service status
const status = alarmService.getStatus();
console.log(status);
// {
//   isRunning: true,
//   port: 3001,
//   connectedClients: 2,
//   lastAlarmStates: { partPresent: false, emergencyStop: false, safetySensor: false }
// }
```

## 🛠️ Troubleshooting

### Common Issues

1. **Connection Refused**

   - Check if alarm service is running
   - Verify port 3001 is available
   - Check firewall settings

2. **No Alarm Events**

   - Verify PLC connection
   - Check register addresses (1490.0, 1490.1, 1490.2)
   - Monitor logs for errors

3. **High CPU Usage**
   - Increase monitoring interval (500ms → 1000ms)
   - Check PLC response times

### Debug Steps

1. Check alarm service logs
2. Test PLC connection manually
3. Verify Socket.IO connection
4. Monitor network traffic

## 🔄 Integration with Main App

The alarm service can run:

1. **Independently**: `npm run alarm`
2. **With Main App**: Automatically started with `npm start`
3. **Multiple Instances**: Different ports for different environments

## 📈 Benefits

- ✅ **Real-time Monitoring**: Continuous safety monitoring
- ✅ **Independent Operation**: Not affected by scan cycle issues
- ✅ **Immediate Alerts**: Instant UI notifications
- ✅ **Scalable**: Multiple clients can connect
- ✅ **Reliable**: Dedicated service with error handling
- ✅ **Easy Integration**: Simple Socket.IO client

## 🎯 Use Cases

- **Safety Dashboards**: Real-time safety status displays
- **Alert Systems**: Immediate notification of safety violations
- **Monitoring Tools**: Continuous system health monitoring
- **Integration**: Easy integration with existing UI frameworks

The Alarm Service provides a robust, independent solution for real-time safety monitoring! 🚨✨
