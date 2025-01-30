import ModbusRTU from "modbus-serial";
import logger from "../logger.js";

class ModbusTestConnection {
  constructor(name) {
    this.client = new ModbusRTU();
    this.name = name;
    this.isConnected = false;
  }

  async connect(ip = "192.168.3.145", port = 502) {
    try {
      await this.client.connectTCP(ip, { port });
      this.client.setID(1);
      this.isConnected = true;
      logger.info(`${this.name}: Connected to Modbus device at ${ip}:${port}`);
    } catch (error) {
      logger.error(`${this.name}: Connection error:`, error);
    }
  }

  async readRegister(address) {
    try {
      const { data } = await this.client.readHoldingRegisters(address, 1);
      logger.info(`${this.name}: Read register ${address}: ${data[0]}`);
      return data[0];
    } catch (error) {
      logger.error(`${this.name}: Error reading register:`, error);
      return null;
    }
  }
}

async function runTest() {
  // Create two connections
  const connection1 = new ModbusTestConnection("Connection 1");
  const connection2 = new ModbusTestConnection("Connection 2");

  // Connect both clients
  await connection1.connect();
  await connection2.connect();

  // Continuous reading loop
  while (true) {
    try {
      // Read from both connections
      const value1 = await connection1.readRegister(1400);
      const value2 = await connection2.readRegister(1400);

      console.log({
        timestamp: new Date().toISOString(),
        connection1: value1,
        connection2: value2,
      });

      // Wait for 1 second before next read
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      logger.error("Test loop error:", error);
    }
  }
}

// Run the test
runTest().catch((error) => {
  logger.error("Test failed:", error);
});
