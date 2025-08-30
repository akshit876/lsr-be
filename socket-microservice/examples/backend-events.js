#!/usr/bin/env node

import socketMicroservice from "../src/index.js";

// Example of how to emit events from the backend
class BackendEventExamples {
  constructor() {
    this.microservice = socketMicroservice;
  }

  // Example 1: Emit system status updates
  async emitSystemStatus() {
    console.log("📊 Emitting system status...");

    const status = {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      disk: Math.random() * 100,
      network: "stable",
    };

    const result = this.microservice.emitSystemStatus(status);
    console.log("✅ System status emitted:", result);
    return result;
  }

  // Example 2: Emit PLC status updates
  async emitPlcStatus() {
    console.log("🔌 Emitting PLC status...");

    const status = {
      connection: "connected",
      ip: "192.168.1.100",
      lastCommunication: new Date().toISOString(),
      registers: {
        scannerTrigger: { value: 1, timestamp: new Date().toISOString() },
        markOn: { value: 0, timestamp: new Date().toISOString() },
        lightOn: { value: 1, timestamp: new Date().toISOString() },
      },
    };

    const result = this.microservice.emitPlcStatus(status);
    console.log("✅ PLC status emitted:", result);
    return result;
  }

  // Example 3: Emit scanner events
  async emitScannerEvent() {
    console.log("🔍 Emitting scanner event...");

    const eventData = {
      scanId: `scan_${Date.now()}`,
      barcode: "123456789",
      timestamp: new Date().toISOString(),
      quality: "good",
      position: { x: 100, y: 200 },
    };

    const result = this.microservice.emitScannerEvent(
      "scan_completed",
      eventData
    );
    console.log("✅ Scanner event emitted:", result);
    return result;
  }

  // Example 4: Emit production events to production group
  async emitProductionEvent() {
    console.log("🏭 Emitting production event...");

    const eventData = {
      jobId: `job_${Date.now()}`,
      partNumber: "ABC123",
      quantity: 100,
      completed: 45,
      status: "running",
    };

    const result = this.microservice.emitProductionEvent(
      "job_progress",
      eventData
    );
    console.log("✅ Production event emitted:", result);
    return result;
  }

  // Example 5: Emit error events
  async emitErrorEvent() {
    console.log("❌ Emitting error event...");

    const errorData = {
      component: "scanner",
      severity: "warning",
      code: "SCAN_001",
      description: "Scanner calibration needed",
    };

    const result = this.microservice.emitErrorEvent(
      "scanner_warning",
      "Scanner calibration needed",
      errorData
    );
    console.log("✅ Error event emitted:", result);
    return result;
  }

  // Example 6: Emit notifications
  async emitNotification() {
    console.log("🔔 Emitting notification...");

    const result = this.microservice.emitNotification(
      "maintenance_reminder",
      "Preventive maintenance due in 24 hours",
      "warning",
      "maintenance"
    );

    console.log("✅ Notification emitted:", result);
    return result;
  }

  // Example 7: Emit to specific group
  async emitToGroup() {
    console.log("👥 Emitting to production group...");

    const data = {
      message: "Shift change in 30 minutes",
      shift: "night",
      timestamp: new Date().toISOString(),
    };

    const result = this.microservice.emitToGroup(
      "production",
      "shift_notification",
      data
    );
    console.log("✅ Group event emitted:", result);
    return result;
  }

  // Example 8: Emit to all clients
  async emitToAll() {
    console.log("🌍 Emitting to all clients...");

    const data = {
      message: "System maintenance scheduled for tonight",
      maintenanceTime: "22:00",
      duration: "2 hours",
      timestamp: new Date().toISOString(),
    };

    const result = this.microservice.emitToAll("maintenance_schedule", data);
    console.log("✅ Broadcast event emitted:", result);
    return result;
  }

  // Example 9: Emit data updates
  async emitDataUpdate() {
    console.log("📊 Emitting data update...");

    const data = {
      partNumber: "XYZ789",
      stockLevel: 150,
      reorderPoint: 50,
      supplier: "Supplier A",
      lastUpdated: new Date().toISOString(),
    };

    const result = this.microservice.emitDataUpdate(
      "inventory_update",
      data,
      "production"
    );
    console.log("✅ Data update emitted:", result);
    return result;
  }

  // Example 10: Emit servo status
  async emitServoStatus() {
    console.log("⚙️ Emitting servo status...");

    const result = this.microservice.emitServoStatus(
      "scanner_servo",
      "moving",
      150.5,
      25.0
    );

    console.log("✅ Servo status emitted:", result);
    return result;
  }

  // Run all examples
  async runAllExamples() {
    console.log("🚀 Running Backend Event Examples...\n");

    try {
      // Wait for microservice to be ready
      await this.waitForMicroservice();

      const examples = [
        { name: "System Status", method: () => this.emitSystemStatus() },
        { name: "PLC Status", method: () => this.emitPlcStatus() },
        { name: "Scanner Event", method: () => this.emitScannerEvent() },
        { name: "Production Event", method: () => this.emitProductionEvent() },
        { name: "Error Event", method: () => this.emitErrorEvent() },
        { name: "Notification", method: () => this.emitNotification() },
        { name: "Group Event", method: () => this.emitToGroup() },
        { name: "Broadcast Event", method: () => this.emitToAll() },
        { name: "Data Update", method: () => this.emitDataUpdate() },
        { name: "Servo Status", method: () => this.emitServoStatus() },
      ];

      for (const example of examples) {
        console.log(`\n${"=".repeat(50)}`);
        console.log(`🧪 Running: ${example.name}`);
        console.log(`${"=".repeat(50)}`);

        try {
          await example.method();
          await this.delay(1000); // Wait 1 second between examples
        } catch (error) {
          console.error(`❌ Failed to run ${example.name}:`, error.message);
        }
      }

      console.log("\n🎉 All examples completed!");
    } catch (error) {
      console.error("❌ Failed to run examples:", error);
    }
  }

  // Wait for microservice to be ready
  async waitForMicroservice() {
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds

    while (attempts < maxAttempts) {
      if (this.microservice.isInitialized) {
        console.log("✅ Microservice is ready!");
        return;
      }

      console.log(
        `⏳ Waiting for microservice to be ready... (${attempts + 1}/${maxAttempts})`
      );
      await this.delay(1000);
      attempts++;
    }

    throw new Error("Microservice failed to initialize within timeout");
  }

  // Utility method for delays
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const examples = new BackendEventExamples();
  examples.runAllExamples().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export default BackendEventExamples;
