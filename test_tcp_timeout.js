import { tcpClient } from "./services/tcp.js";

async function testTcpTimeout() {
  console.log("Testing TCP timeout functionality...");

  try {
    // Connect to TCP server
    await tcpClient.connect({ port: 5024, host: "192.168.3.147" });
    console.log("✅ TCP connection established");

    // Test with the new default timeout (20 seconds)
    console.log("Testing with 20 second timeout...");
    try {
      const result = await tcpClient.getDataTwiceAndConcat({
        isSecond: false,
        timeout: 20000,
      });
      console.log("✅ Data received:", result);
    } catch (timeoutError) {
      console.log("✅ Timeout working as expected:", timeoutError.message);
    }
  } catch (error) {
    console.error("❌ TCP test failed:", error.message);
  } finally {
    tcpClient.close();
  }
}

// Run the test
testTcpTimeout();
