#!/usr/bin/env node

/**
 * Test script to verify configuration values
 */

import { MAIN_SCANNER_CONFIG } from "./config/network.js";

console.log("🔍 Configuration Values Test");
console.log("=".repeat(50));

console.log(
  "MAIN_SCANNER_CONFIG:",
  JSON.stringify(MAIN_SCANNER_CONFIG, null, 2)
);

console.log("\nEnvironment variables:");
console.log("SCANNER_HOST:", process.env.SCANNER_HOST);
console.log("SCANNER_PORT:", process.env.SCANNER_PORT);

console.log("\nProcessed values:");
console.log("Host:", process.env.SCANNER_HOST || MAIN_SCANNER_CONFIG.host);
console.log(
  "Port:",
  parseInt(process.env.SCANNER_PORT, 10) || MAIN_SCANNER_CONFIG.port
);

console.log("\n✅ Test complete");
