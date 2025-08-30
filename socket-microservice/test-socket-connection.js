#!/usr/bin/env node

import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:3003";

console.log("🔌 Testing Socket.IO connection...");
console.log(`📡 Connecting to: ${SOCKET_URL}`);

// Create socket connection
const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  timeout: 5000,
});

// Connection events
socket.on("connect", () => {
  console.log("✅ Connected to Socket.IO server!");
  console.log(`🆔 Socket ID: ${socket.id}`);

  // Test a simple event
  socket.emit("get-event-service-status");
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection failed:", error.message);
  console.error("🔍 Error details:", error);
});

socket.on("disconnect", (reason) => {
  console.log("🔌 Disconnected:", reason);
});

socket.on("event-service-status", (status) => {
  console.log("📊 Service status received:", status);
});

socket.on("error", (error) => {
  console.error("❌ Socket error:", error);
});

// Test events
socket.on("connect", () => {
  // Wait a bit then test some events
  setTimeout(() => {
    console.log("🧪 Testing events...");

    // Test scanner trigger
    socket.emit("scanner_trigger");

    // Test health check
    socket.emit("health-check");
  }, 1000);
});

// Listen for responses
socket.on("scanner_trigger_success", (data) => {
  console.log("✅ Scanner trigger success:", data);
});

socket.on("health-check-response", (data) => {
  console.log("✅ Health check response:", data);
});

// Handle process exit
process.on("SIGINT", () => {
  console.log("\n🛑 Disconnecting...");
  socket.disconnect();
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  if (!socket.connected) {
    console.error("⏰ Connection timeout after 10 seconds");
    process.exit(1);
  }
}, 10000);
