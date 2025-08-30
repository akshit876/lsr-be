#!/usr/bin/env node

import { createServer } from "http";

console.log("🔍 Checking if port 3003 is available...");

const server = createServer();

server.listen(3003, () => {
  console.log("✅ Port 3003 is available and can be bound");
  console.log("🌐 Server listening on port 3003");

  // Close after 2 seconds
  setTimeout(() => {
    server.close();
    console.log("🔒 Port 3003 test completed");
    process.exit(0);
  }, 2000);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("❌ Port 3003 is already in use!");
    console.error("💡 Another service might be running on this port");
    console.error("🔍 Check what's using port 3003:");
    console.error("   netstat -an | findstr :3003");
  } else {
    console.error("❌ Error binding to port 3003:", error.message);
  }
  process.exit(1);
});
