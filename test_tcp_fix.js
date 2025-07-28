import { tcpClient } from "./services/tcp.js";

async function testTCPClient() {
  try {
    console.log("Testing TCP client with timeout fixes...");

    // Connect to TCP server
    await tcpClient.connect({ port: 5024, host: "192.168.3.147" });
    console.log("Connected to TCP server");

    // Test first scan (should timeout gracefully)
    console.log("\nTesting first scan...");
    try {
      const firstResult = await tcpClient.getDataTwiceAndConcat({
        isFirst: true,
        isSecond: false,
      });
      console.log("First scan result:", firstResult);
    } catch (error) {
      console.log("First scan error (expected):", error.message);
    }

    // Test second scan (should timeout gracefully)
    console.log("\nTesting second scan...");
    try {
      const secondResult = await tcpClient.getDataTwiceAndConcat({
        isFirst: false,
        isSecond: true,
      });
      console.log("Second scan result:", secondResult);
    } catch (error) {
      console.log("Second scan error (expected):", error.message);
    }

    console.log("\nTCP client test completed");
  } catch (error) {
    console.error("Test failed:", error.message);
  } finally {
    tcpClient.close();
  }
}

testTCPClient();
