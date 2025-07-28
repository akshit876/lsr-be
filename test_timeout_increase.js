import { tcpClient } from "./services/tcp.js";

async function testTimeoutIncrease() {
  try {
    console.log("Testing increased timeout values...");

    // Connect to TCP server
    await tcpClient.connect({ port: 5024, host: "192.168.3.147" });
    console.log("Connected to TCP server");

    console.log("\nTesting with increased timeouts:");
    console.log("- TCP readData timeout: 30 seconds");
    console.log("- Second data timeout: 25 seconds");
    console.log("- Overall scanner timeout: 60 seconds");

    // Test first scan
    console.log("\nTesting first scan with 30s timeout...");
    const startTime = Date.now();
    try {
      const firstResult = await tcpClient.getDataTwiceAndConcat({
        isFirst: true,
        isSecond: false,
      });
      const duration = (Date.now() - startTime) / 1000;
      console.log(`First scan completed in ${duration}s:`, firstResult);
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      console.log(`First scan failed after ${duration}s:`, error.message);
    }

    // Test second scan
    console.log("\nTesting second scan with 25s timeout for second data...");
    const startTime2 = Date.now();
    try {
      const secondResult = await tcpClient.getDataTwiceAndConcat({
        isFirst: false,
        isSecond: true,
      });
      const duration = (Date.now() - startTime2) / 1000;
      console.log(`Second scan completed in ${duration}s:`, secondResult);
    } catch (error) {
      const duration = (Date.now() - startTime2) / 1000;
      console.log(`Second scan failed after ${duration}s:`, error.message);
    }

    console.log("\nTimeout test completed");
  } catch (error) {
    console.error("Test failed:", error.message);
  } finally {
    tcpClient.close();
  }
}

testTimeoutIncrease();
