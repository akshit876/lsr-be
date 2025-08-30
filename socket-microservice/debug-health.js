#!/usr/bin/env node

import { ModbusService } from "./src/services/modbusService.js";
import { logger } from "./src/utils/logger.js";

async function debugHealthCheck() {
  console.log("🔍 Debugging Health Check...");

  try {
    // Create ModbusService instance
    const modbusService = new ModbusService();

    console.log("📡 Initializing Modbus service...");
    await modbusService.initialize();

    console.log("✅ Modbus service initialized");
    console.log("🔍 Running health check...");

    // Test health check
    const health = await modbusService.healthCheck();
    console.log("📊 Health check result:", health);

    // Test status
    const status = modbusService.getStatus();
    console.log("📊 Service status:", status);

    console.log("✅ All tests passed!");
  } catch (error) {
    console.error("❌ Error during health check:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
  }
}

// Run the debug function
debugHealthCheck().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
