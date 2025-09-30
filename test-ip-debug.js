#!/usr/bin/env node

/**
 * Debug script to check what IP is being used in TcpScannerService
 */

import { MAIN_SCANNER_CONFIG } from "./config/network.js";
import TcpScannerService from "./services/TcpScannerService.js";

console.log("🔍 IP Debug Test");
console.log("=".repeat(50));

console.log("MAIN_SCANNER_CONFIG from network.js:", MAIN_SCANNER_CONFIG);

// Create TcpScannerService instance
const scanner = new TcpScannerService(MAIN_SCANNER_CONFIG);

console.log("\nTcpScannerService instance created");
console.log("scanner.options:", scanner.options);
console.log("scanner.instanceId:", scanner.instanceId);

// Test the log method
console.log("\nTesting log method...");
scanner.log("This is a test log message");

console.log("\n✅ Test complete");
