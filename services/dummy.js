import ModbusRTU from "modbus-serial";
const client = new ModbusRTU();

const DEFAULT_MODBUS_IP = "192.168.3.146";
const DEFAULT_MODBUS_PORT = 502;
// open connection to a serial port
const MODBUS_IP = "192.168.3.145";
const MODBUS_PORT = 502;

(async () => {
  try {
    await client.connectTCP(MODBUS_IP, { port: MODBUS_PORT });
    client.setID(1); // Adjust the slave ID as needed
    console.log("Connected to Modbus device");

    const data = await client.readHoldingRegisters(0, 10); // Test read registers
    console.log("Read Registers:", data.data);
  } catch (error) {
    console.error(
      "Error connecting or reading from Modbus device:",
      error.message
    );
  } finally {
    client.close();
  }
})();
