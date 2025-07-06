import { io } from "socket.io-client";

const socket = io("http://localhost:3002");

let testStep = 0;
const testBits = [
  { register: 1481, bit: 0, name: "Manual Scan" },
  { register: 1480, bit: 0, name: "Manual Mark On" },
  { register: 1482, bit: 0, name: "Manual Light" },
];

socket.on("connect", () => {
  console.log("Connected to server");
  runNextTest();
});

function runNextTest() {
  if (testStep < testBits.length) {
    const bit = testBits[testStep];
    console.log(`Testing ${bit.name} bit (${bit.register}.${bit.bit})...`);
    socket.emit("manual-run-bits", {
      register: bit.register,
      bit: bit.bit,
      value: 1,
    });
  }
}

socket.on("manualRunBitsSuccess", (data) => {
  console.log("✅ Manual run bits success:", data);
  testStep++;

  if (testStep < testBits.length) {
    runNextTest();
  } else {
    console.log("All manual run bits tested successfully!");
    socket.disconnect();
  }
});

socket.on("error", (error) => {
  console.error("❌ Error:", error);
  socket.disconnect();
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log("Test timeout - disconnecting");
  socket.disconnect();
  process.exit(1);
}, 10000);
