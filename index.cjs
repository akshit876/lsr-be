// index.cjs
const { spawn } = require("child_process");
const path = require("path");

// Start the ES module server
const serverProcess = spawn("node", ["server.js"], {
  stdio: "inherit",
  env: process.env,
});

serverProcess.on("exit", (code) => {
  process.exit(code);
});
