# Alarm Service Comparison

## 🔍 **Dependency Analysis**

### Original Alarm Service (`AlarmService.js`)

```javascript
// ❌ DEPENDS ON EXISTING CODE
import { readBit } from "./modbus.js"; // Uses your existing modbus service
import logger from "../logger.js"; // Uses your existing logger
```

### Independent Alarm Service (`IndependentAlarmService.js`)

```javascript
// ✅ COMPLETELY INDEPENDENT
import { ModbusRTU } from "modbus-serial"; // Own modbus connection
import logger from "../logger.js"; // Only logger dependency
```

## 📊 **Comparison Table**

| Feature               | Original Service             | Independent Service           |
| --------------------- | ---------------------------- | ----------------------------- |
| **Modbus Connection** | ❌ Uses existing `modbus.js` | ✅ Own `ModbusRTU` connection |
| **PLC Registers**     | ❌ Same as main app          | ✅ Same registers (1490.0-2)  |
| **Logger**            | ❌ Uses existing logger      | ❌ Uses existing logger       |
| **Socket.IO**         | ✅ Independent port          | ✅ Independent port           |
| **Error Handling**    | ❌ Affected by main app      | ✅ Completely isolated        |
| **Startup**           | ❌ Needs main app running    | ✅ Runs standalone            |
| **Configuration**     | ❌ Uses main app config      | ✅ Own configuration          |

## 🚀 **How to Use Each**

### Option 1: Original Service (Depends on Main App)

```bash
# Start main app first (includes modbus connection)
npm start

# Then start alarm service (uses existing modbus)
npm run alarm
```

### Option 2: Independent Service (Completely Standalone)

```bash
# Start completely independent alarm service
npm run alarm-independent

# No need to start main app!
```

## 🔧 **Configuration Differences**

### Original Service

```javascript
// Uses environment variables from main app
const MODBUS_IP = process.env.MODBUS_IP;
const MODBUS_PORT = process.env.MODBUS_PORT;
```

### Independent Service

```javascript
// Own configuration with fallbacks
const config = {
  port: parseInt(process.env.ALARM_PORT) || 3001,
  plcHost: process.env.MODBUS_IP || "192.168.3.146",
  plcPort: parseInt(process.env.MODBUS_PORT) || 502,
};
```

## 📡 **Socket.IO Events**

Both services emit the same events, but independent service adds `service: "independent"`:

```javascript
// Original service
{
  timestamp: "2025-09-30T10:51:05.000Z",
  violation: "Part not present",
  register: "1490.0",
  value: true
}

// Independent service
{
  timestamp: "2025-09-30T10:51:05.000Z",
  violation: "Part not present",
  register: "1490.0",
  value: true,
  service: "independent"  // ← Added identifier
}
```

## 🎯 **When to Use Which**

### Use Original Service When:

- ✅ Main app is always running
- ✅ You want to share modbus connection
- ✅ You want to use existing configuration
- ✅ You want to minimize resource usage

### Use Independent Service When:

- ✅ You want complete independence
- ✅ Main app might not be running
- ✅ You want to test alarms separately
- ✅ You want different PLC configuration
- ✅ You want to run on different machine

## 🔄 **Migration Path**

### From Original to Independent:

1. **Install modbus-serial** (if not already installed):

   ```bash
   npm install modbus-serial
   ```

2. **Update your UI** to handle both services:

   ```javascript
   // Connect to independent service
   const socket = io("http://localhost:3001");

   socket.on("safety_violation", (data) => {
     if (data.service === "independent") {
       console.log("Independent alarm:", data.violation);
     } else {
       console.log("Main app alarm:", data.violation);
     }
   });
   ```

3. **Run independent service**:
   ```bash
   npm run alarm-independent
   ```

## 🛠️ **Troubleshooting**

### Original Service Issues:

- Main app must be running
- Modbus connection shared with main app
- Errors in main app affect alarm service

### Independent Service Issues:

- Requires separate modbus connection
- Uses more resources (own connection)
- Need to configure PLC settings separately

## 📈 **Recommendation**

**Use Independent Service** for:

- 🎯 **Production**: More reliable, won't be affected by main app issues
- 🧪 **Testing**: Can test alarms without running main app
- 🔧 **Development**: Easier to debug and develop
- 🚀 **Deployment**: Can run on separate server

**Use Original Service** for:

- 💰 **Resource Saving**: Shares modbus connection
- 🔗 **Integration**: Tighter integration with main app
- ⚡ **Simplicity**: Less configuration needed

The Independent Service is truly independent and won't be affected by your current code or modbus issues! 🚨✨
