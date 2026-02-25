# How to use safety alarms in the UI

The backend emits **safety/alarm** events over Socket.IO. Your frontend can listen and show them in a list, banner, or alarm panel.

---

## 1. Event name and payload

**Event:** `safety_violation`  
**Emitted by:** Backend (scanCycles) when any safety bit on PLC register **1490** is set.

**Payload:**

```ts
{
  timestamp: string;   // ISO date, e.g. "2026-03-15T10:30:00.000Z"
  violation: string;   // Human-readable alarm message
  cycleNumber: number; // Current scan cycle number
}
```

**Possible `violation` values (from backend):**

| violation | PLC bit |
|-----------|---------|
| Part not present | 1490.0 |
| Emergency stop activated | 1490.1 |
| Safety sensor triggered | 1490.2 |
| Emergency push button pressed | 1490.3 |
| Safety curtain interrupted | 1490.4 |
| **SLIDE FWD REED-SWITCH MISSING** | 1490.5 |
| **SLIDE HOME REED-SWITCH MISSING** | 1490.6 |
| **LASER SOURCE NOT READY** | 1490.7 |
| **Put part in rejection bin** | 1490.8 |

---

### 1.1. When alarms clear (PLC bit goes off)

**Event:** `safety_cleared`  
**Emitted by:** Backend when a safety bit on register **1490** goes from 1 → 0.

**Payload:** Same shape as `safety_violation`:

```ts
{
  timestamp: string;
  violation: string;   // Same string as when it fired (use to match and remove)
  cycleNumber: number;
}
```

**UI must:** On `safety_cleared`, remove or dismiss the toast/row for that `violation` so alarm UI does not stay on screen after the PLC has cleared it. Match by `payload.violation` (e.g. remove from active list or dismiss that toast).

---

## 2. Connect to the backend

Backend default: **http://localhost:3002** (or set `PORT` in env).  
Socket.IO connects to the **same URL** as the HTTP server (no separate path).

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:3002", {
  transports: ["websocket", "polling"],
  withCredentials: true,
});
```

Use your real backend URL in production (e.g. `https://your-api.com` or `http://your-server-ip:3002`).

---

## 3. Listen for alarms and cleared (vanilla JS / any framework)

```js
socket.on("safety_violation", (payload) => {
  showAlarm({
    message: payload.violation,
    time: payload.timestamp,
    cycle: payload.cycleNumber,
  });
});

// Remove/dismiss when PLC clears the alarm
socket.on("safety_cleared", (payload) => {
  removeAlarmByViolation(payload.violation);
});
```

**Toasts:** Show alarm toasts on the **right** side of the screen (e.g. `position: 'top-right'` or `bottom-right`) so they align with the rest of the UI.

**Single alarm UI:** Use one alarm list or toast container for `safety_violation` / `safety_cleared`. Do not add a second alarm panel or duplicate widgets, or you will get “extra GUI” and inconsistent state.

---

## 4. React example

```jsx
import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:3002"; // or your backend URL

export function AlarmsPanel() {
  const [alarms, setAlarms] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const s = io(BACKEND_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
    });
    setSocket(s);

    s.on("safety_violation", (payload) => {
      setAlarms((prev) => [
        {
          id: `${payload.timestamp}-${payload.violation}`,
          message: payload.violation,
          time: payload.timestamp,
          cycle: payload.cycleNumber,
        },
        ...prev.filter((a) => a.message !== payload.violation).slice(0, 49),
      ]);
    });

    s.on("safety_cleared", (payload) => {
      setAlarms((prev) => prev.filter((a) => a.message !== payload.violation));
    });

    return () => {
      s.off("safety_violation");
      s.off("safety_cleared");
      s.disconnect();
    };
  }, []);

  return (
    <div className="alarms-panel">
      <h3>Alarms</h3>
      {alarms.length === 0 ? (
        <p>No active alarms</p>
      ) : (
        <ul>
          {alarms.map((a) => (
            <li key={a.id}>
              <strong>{a.message}</strong> — {new Date(a.time).toLocaleString()} (cycle {a.cycle})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

---

## 5. Vue 3 example

```vue
<template>
  <div class="alarms-panel">
    <h3>Alarms</h3>
    <ul v-if="alarms.length">
      <li v-for="a in alarms" :key="a.id">
        <strong>{{ a.message }}</strong> — {{ formatTime(a.time) }} (cycle {{ a.cycle }})
      </li>
    </ul>
    <p v-else>No active alarms</p>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:3002";
const alarms = ref([]);
let socket = null;

function formatTime(iso) {
  return new Date(iso).toLocaleString();
}

onMounted(() => {
  socket = io(BACKEND_URL, { transports: ["websocket", "polling"], withCredentials: true });
  socket.on("safety_violation", (payload) => {
    alarms.value = [
      { id: `${payload.timestamp}-${payload.violation}`, ...payload },
      ...alarms.value.filter((a) => a.violation !== payload.violation).slice(0, 49),
    ];
  });
  socket.on("safety_cleared", (payload) => {
    alarms.value = alarms.value.filter((a) => a.violation !== payload.violation);
  });
});

onUnmounted(() => {
  if (socket) {
    socket.off("safety_violation");
    socket.off("safety_cleared");
    socket.disconnect();
  }
});
</script>
```

---

## 6. Optional: highlight the two new reed-switch alarms

You can style **SLIDE FWD REED-SWITCH MISSING** and **SLIDE HOME REED-SWITCH MISSING** differently (e.g. color or icon):

```js
function getAlarmSeverity(violation) {
  if (
    violation === "SLIDE FWD REED-SWITCH MISSING" ||
    violation === "SLIDE HOME REED-SWITCH MISSING"
  ) {
    return "reed_switch"; // e.g. orange style
  }
  return "safety";       // e.g. red style
}

// In your list item:
const severity = getAlarmSeverity(payload.violation);
```

---

## 7. CORS

Backend allows origin **http://localhost:3000**. If your UI runs on another port or domain, either:

- Set `cors.origin` in `server.js` to your UI origin, or  
- Use a proxy so the UI and API share the same origin.

---

## Summary

| What | Value |
|------|--------|
| Alarm event | `safety_violation` (bit = 1) |
| Clear event | `safety_cleared` (bit 1 → 0) — **listen and remove toasts** |
| Backend URL (dev) | `http://localhost:3002` |
| Payload | `{ timestamp, violation, cycleNumber }` |
| New alarms | `SLIDE FWD REED-SWITCH MISSING`, `SLIDE HOME REED-SWITCH MISSING`, `LASER SOURCE NOT READY`, `Put part in rejection bin` |

**UI checklist:** Use one alarm/toast area; position toasts on the **right**; on `safety_cleared` remove or dismiss the matching toast so alarms don’t stay after the PLC clears them.
