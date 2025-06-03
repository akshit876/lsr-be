# Manual Entry UI Integration Guide

## Overview

This guide explains how to integrate the manual entry workflow for the new machine setup. The workflow is simplified compared to the scanner-based system.

## Workflow Steps

1. User enters data manually via UI
2. System generates barcode from manual input
3. Files are transferred to text file
4. System waits for cycle end bit
5. Cycle completes and UI refreshes

## Frontend Socket Events

### 1. Submit Manual Entry

```javascript
// Send manual data to backend
socket.emit("manual-entry-submit", {
  manualData: "P5314775:57386:TTA:D25154:VR0003", // User entered data
  modelNumber: "7386", // Optional model number
});
```

### 2. Listen for Manual Entry Events

```javascript
// Manual entry received confirmation
socket.on("manual-entry-received", (data) => {
  console.log("Manual data received:", data.manualData);
  console.log("Message:", data.message);
  // Show user that data was accepted
  showNotification("success", data.message);
});

// Manual entry error
socket.on("manual-entry-error", (error) => {
  console.error("Manual entry error:", error.message);
  // Show error to user
  showNotification("error", error.message);
});

// Cycle completion
socket.on("manual-cycle-completed", (event) => {
  console.log(`Cycle ${event.cycleNumber} completed:`, event.success);
  console.log("Result:", event.result);
  console.log("Data:", event.data);

  if (event.success) {
    showNotification(
      "success",
      `Cycle ${event.cycleNumber} completed successfully`
    );
  } else {
    showNotification(
      "error",
      `Cycle ${event.cycleNumber} failed: ${event.error}`
    );
  }

  // Refresh the production records table
  refreshProductionRecords();
});
```

### 3. Check System Status

```javascript
// Check if system is ready for new manual entry
socket.emit("check-manual-entry-status");

socket.on("manual-entry-status", (status) => {
  console.log("System ready:", status.isReady);
  console.log("Current cycle count:", status.cycleCount);

  // Enable/disable manual entry form based on status
  document.getElementById("manual-entry-form").disabled = !status.isReady;
});
```

### 4. Reset Cycle Count

```javascript
// Reset cycle count (admin function)
socket.emit("reset-manual-entry-cycle");

socket.on("manual-entry-cycle-reset", (response) => {
  console.log("Cycle count reset:", response.newCycleCount);
  showNotification("info", response.message);
});
```

### 5. Real-time Data Updates

```javascript
// Listen for data updates (same as before)
socket.on("csv-data", (data) => {
  updateProductionRecords(data.data);
});

// Listen for marking data (manual entry specific)
socket.on("marking_data", (event) => {
  if (event.type === "manual_entry") {
    console.log("Manual marking data:", event.data);
    updateMarkingDisplay(event.data);
  }
});
```

## Sample HTML Form

```html
<div id="manual-entry-container">
  <h3>Manual Entry</h3>

  <form id="manual-entry-form">
    <div class="input-group">
      <label for="manual-data">Enter Code:</label>
      <input
        type="text"
        id="manual-data"
        placeholder="P5314775:57386:TTA:D25154:VR0003"
        required
      />
    </div>

    <div class="button-group">
      <button type="submit" id="submit-manual-entry">Submit Entry</button>
      <button type="button" id="check-status">Check Status</button>
    </div>
  </form>

  <div id="status-display">
    <p>Status: <span id="system-status">Checking...</span></p>
    <p>Cycle Count: <span id="cycle-count">0</span></p>
  </div>

  <div id="last-entry-display">
    <h4>Last Entry:</h4>
    <p id="last-entry-data">None</p>
  </div>
</div>
```

## Sample JavaScript Implementation

```javascript
class ManualEntryController {
  constructor(socket) {
    this.socket = socket;
    this.setupEventListeners();
    this.setupSocketEvents();
    this.checkStatus();
  }

  setupEventListeners() {
    const form = document.getElementById("manual-entry-form");
    const statusBtn = document.getElementById("check-status");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submitManualEntry();
    });

    statusBtn.addEventListener("click", () => {
      this.checkStatus();
    });
  }

  setupSocketEvents() {
    this.socket.on("manual-entry-received", (data) => {
      this.showStatus("success", data.message);
      this.updateLastEntry(data.manualData);
      this.disableForm();
    });

    this.socket.on("manual-entry-error", (error) => {
      this.showStatus("error", error.message);
      this.enableForm();
    });

    this.socket.on("manual-cycle-completed", (event) => {
      if (event.success) {
        this.showStatus("success", `Cycle ${event.cycleNumber} completed`);
      } else {
        this.showStatus("error", `Cycle failed: ${event.error}`);
      }

      this.updateCycleCount(event.cycleNumber);
      this.enableForm();
    });

    this.socket.on("manual-entry-status", (status) => {
      this.updateSystemStatus(status.isReady ? "Ready" : "Busy");
      this.updateCycleCount(status.cycleCount);

      if (status.isReady) {
        this.enableForm();
      } else {
        this.disableForm();
      }
    });
  }

  submitManualEntry() {
    const manualData = document.getElementById("manual-data").value.trim();

    if (!manualData) {
      this.showStatus("error", "Please enter manual data");
      return;
    }

    this.socket.emit("manual-entry-submit", {
      manualData: manualData,
    });

    this.showStatus("info", "Submitting manual entry...");
  }

  checkStatus() {
    this.socket.emit("check-manual-entry-status");
  }

  showStatus(type, message) {
    // Implement your notification system here
    console.log(`${type.toUpperCase()}: ${message}`);
  }

  updateSystemStatus(status) {
    document.getElementById("system-status").textContent = status;
  }

  updateCycleCount(count) {
    document.getElementById("cycle-count").textContent = count;
  }

  updateLastEntry(data) {
    document.getElementById("last-entry-data").textContent = data;
  }

  enableForm() {
    document.getElementById("manual-entry-form").disabled = false;
    document.getElementById("manual-data").value = "";
  }

  disableForm() {
    document.getElementById("manual-entry-form").disabled = true;
  }
}

// Initialize when socket is connected
const socket = io();
socket.on("connect", () => {
  const manualEntryController = new ManualEntryController(socket);
});
```

## Configuration Notes

### Backend Configuration

- The system uses the same MongoDB collections as the scanner system
- Manual entries are marked with `ScannerData: "MANUAL_ENTRY"`
- Grading is set to "MANUAL" for manual entries

### PLC Integration

- System waits for start signal on bit `1410.0`
- Signals file transfer completion on bit `1414.15`
- Waits for cycle end signal on bit `1415.7`

### Database Fields

Manual entries will have these characteristics:

- `MarkingData`: The user-entered manual data
- `ScannerData`: "MANUAL_ENTRY"
- `Result`: "OK" or "NG" based on cycle completion
- `Grade`: "MANUAL"
- `SerialNumber`: Auto-generated (MODEL-ID format)

## Testing

Run the test script to verify the manual entry workflow:

```bash
node test-manual-entry.js
```

This will simulate manual entries and verify the complete workflow.

## Migration from Scanner System

If you need to support both scanner and manual entry systems:

1. Add a configuration flag to determine the workflow mode
2. Use conditional logic in the UI to show/hide appropriate controls
3. The backend already supports both workflows independently

## Troubleshooting

### Common Issues

1. **"Manual data is required" error**: Ensure the input field has valid data
2. **System always shows "Busy"**: Check PLC bit states and cycle completion
3. **No UI updates**: Verify socket connections and event listeners
4. **File write errors**: Check file permissions in the data directory

### Debug Steps

1. Check browser console for socket events
2. Monitor backend logs for cycle progression
3. Verify PLC bit states
4. Check MongoDB records for proper data storage
