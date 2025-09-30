#!/usr/bin/env node

/**
 * Windows Service Installer
 * Installs both main server and alarm service as Windows services
 */

import { execSync } from "child_process";
import logger from "./logger.js";
import process from "process";

function installWindowsService() {
  try {
    logger.info("🔧 Installing Windows Services...");

    // Install main server service
    logger.info("📦 Installing Main Server service...");
    execSync(
      `sc create "LaserMainServer" binPath= "${process.cwd()}\\node_modules\\.bin\\node.cmd ${process.cwd()}\\server.js" start= auto`,
      { stdio: "inherit" }
    );

    // Install alarm service
    logger.info("📦 Installing Alarm Service...");
    execSync(
      `sc create "LaserAlarmService" binPath= "${process.cwd()}\\node_modules\\.bin\\node.cmd ${process.cwd()}\\independent-alarm-service.js" start= auto`,
      { stdio: "inherit" }
    );

    logger.success("✅ Windows Services installed successfully!");
    logger.info("🚀 Starting services...");

    // Start services
    execSync('sc start "LaserMainServer"', { stdio: "inherit" });
    execSync('sc start "LaserAlarmService"', { stdio: "inherit" });

    logger.success("✅ Both services started!");
    logger.info("📋 Services will start automatically on Windows boot");
    logger.info("🔧 Use 'services.msc' to manage services");
  } catch (error) {
    logger.error("❌ Failed to install Windows services:", error.message);
    logger.info("💡 Run as Administrator to install services");
  }
}

function uninstallWindowsService() {
  try {
    logger.info("🗑️ Uninstalling Windows Services...");

    // Stop services
    execSync('sc stop "LaserMainServer"', { stdio: "inherit" });
    execSync('sc stop "LaserAlarmService"', { stdio: "inherit" });

    // Delete services
    execSync('sc delete "LaserMainServer"', { stdio: "inherit" });
    execSync('sc delete "LaserAlarmService"', { stdio: "inherit" });

    logger.success("✅ Windows Services uninstalled successfully!");
  } catch (error) {
    logger.error("❌ Failed to uninstall Windows services:", error.message);
  }
}

// Command line interface
const command = process.argv[2];

switch (command) {
  case "install":
    installWindowsService();
    break;
  case "uninstall":
    uninstallWindowsService();
    break;
  default:
    logger.info("Usage:");
    logger.info(
      "  node install-windows-service.js install    - Install services"
    );
    logger.info(
      "  node install-windows-service.js uninstall  - Uninstall services"
    );
    break;
}
