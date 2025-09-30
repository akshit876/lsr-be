#!/usr/bin/env node

/**
 * Debug script to check network configuration values
 */

import {
  PLC_CONFIG,
  MAIN_SCANNER_CONFIG,
  MIDDLE_SCANNER_CONFIG,
} from "./config/network.js";
import TcpScannerService from "./services/TcpScannerService.js";

console.log("🔍 Network Configuration Debug");
console.log("=".repeat(50));

console.log("PLC_CONFIG:", PLC_CONFIG);
console.log("MAIN_SCANNER_CONFIG:", MAIN_SCANNER_CONFIG);
console.log("MIDDLE_SCANNER_CONFIG:", MIDDLE_SCANNER_CONFIG);

console.log("\n🔍 Testing TcpScannerService instantiation...");

// Test with MAIN_SCANNER_CONFIG
const tcpScannerService = new TcpScannerService(MAIN_SCANNER_CONFIG);
console.log("TcpScannerService options:", tcpScannerService.options);
console.log("TcpScannerService instanceId:", tcpScannerService.instanceId);

// Test the log method
console.log("\n🔍 Testing log method...");
tcpScannerService.log("Test log message");

console.log("\n✅ Debug complete");
