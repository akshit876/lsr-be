#!/usr/bin/env node

/**
 * Run New Scan System
 *
 * Simple script to run the new clean implementation.
 */

import logger from "./logger.js";

async function runNewSystem() {
  try {
    logger.info("🚀 Starting New Scan System...");

    // Import and start the server
    const { default: LaserMarkingServer } = await import("./server-new.js");

    logger.success("✅ New Scan System started successfully");
    logger.info("📊 Check http://localhost:3000/health for status");
    logger.info(
      "📊 Check http://localhost:3000/status for detailed information"
    );
    logger.info("🛑 Press Ctrl+C to stop");
  } catch (error) {
    logger.error("❌ Failed to start new scan system:", error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("🛑 Shutting down new scan system...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("🛑 Shutting down new scan system...");
  process.exit(0);
});

// Start the system
runNewSystem();
