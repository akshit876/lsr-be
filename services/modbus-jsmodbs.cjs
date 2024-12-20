const Modbus = require("jsmodbus");
const net = require("net");
const logger = require("../logger.cjs");
const { emitErrorEvent } = require("./utils.cjs");

// Default values
const DEFAULT_MODBUS_IP = "192.168.3.146";
const DEFAULT_MODBUS_PORT = 502;

const MODBUS_IP = process.env.MODBUS_HOST || DEFAULT_MODBUS_IP;
const MODBUS_PORT =
  parseInt(process.env.MODBUS_PORT, 10) || DEFAULT_MODBUS_PORT;

class ModbusConnection {
  constructor() {
    this.socket = new net.Socket();
    this.client = null;
    this.isConnected = false;
    this.reconnectInterval = 5000; // 5 seconds
  }

  async connect() {
    if (this.isConnected) {
      return;
    }

    try {
      await new Promise((resolve, reject) => {
        this.socket.connect(
          {
            host: MODBUS_IP,
            port: MODBUS_PORT,
          },
          () => {
            this.client = new Modbus.client.TCP(this.socket);
            this.isConnected = true;
            logger.info(
              `Connected to Modbus device at ${MODBUS_IP}:${MODBUS_PORT}`
            );
            resolve();
          }
        );

        this.socket.on("error", (error) => {
          reject(error);
        });

        this.socket.on("close", () => {
          this.handleDisconnect();
        });
      });
    } catch (error) {
      console.log("connect", { error });
      emitErrorEvent(
        this.socket,
        "MODBUS_CONNECT_ERROR",
        `Error connecting to Modbus device: ${error.message}`
      );
    }
  }

  handleDisconnect() {
    logger.warn("Modbus connection closed. Attempting to reconnect...");
    this.isConnected = false;
    this.client = null;
  }

  async ensureConnection() {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  async readRegister(address, len, conti = null, bit = null, isPrint = true) {
    await this.ensureConnection();
    try {
      const response = await this.client.readHoldingRegisters(address, len);
      const data = response.response._body.valuesAsArray;

      if (isPrint) {
        if (!conti && !bit) {
          logger.info(
            `Read registers starting at address ${address} (length: ${len}): ${data}`
          );
        } else {
          logger.info(
            `Read registers starting at address ${address} (length: ${len}) (bit : ${bit}): ${data}`
          );
        }
      }
      return data;
    } catch (error) {
      console.log({ error });
      emitErrorEvent(
        this.socket,
        "MODBUS_READ_ERROR",
        `Error reading registers at address ${address}: ${error.message}`
      );
      this.handleError(error);
      throw error;
    }
  }

  convertToASCII(registerValues) {
    let asciiString = "";
    registerValues.forEach((value) => {
      const lowByte = value & 0xff;
      const highByte = (value >> 8) & 0xff;
      asciiString +=
        String.fromCharCode(lowByte) + String.fromCharCode(highByte);
    });
    return asciiString;
  }

  async writeBitWithReset(
    address,
    bitPosition,
    value,
    delay = 200,
    isPrint = true
  ) {
    await this.ensureConnection();
    try {
      // Write the initial value to the bit
      await this.writeBit(address, bitPosition, value);
      logger.info(
        `Successfully wrote bit ${bitPosition} with value ${value} to register ${address}`
      );

      // Wait for the specified delay
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Reset the bit to 0 after the delay
      await this.writeBit(address, bitPosition, 0);
      if (isPrint) {
        logger.info(
          `Successfully reset bit ${bitPosition} to 0 after ${delay}ms in register ${address}`
        );
      }
    } catch (error) {
      console.error({ error });
      emitErrorEvent(
        this.socket,
        "MODBUS_WRITE_BIT_RESET_ERROR",
        `Error writing or resetting bit ${bitPosition} in register ${address}: ${error.message}`
      );
      this.handleError(error);
      throw error;
    }
  }

  async readRegisterAndProvideASCII(address, len) {
    try {
      const data = await this.readRegister(address, len);
      let asciiString = this.convertToASCII(data);
      asciiString = asciiString.replace(/\x00/g, " ").trim();
      console.log({ asciiString });
      console.log(
        `Read registers starting at address ${address} (length: ${len}): ${data} (ASCII: ${asciiString})`
      );
      return asciiString;
    } catch (error) {
      emitErrorEvent(
        this.socket,
        "MODBUS_READ_ASCII_ERROR",
        `Error reading registers at address ${address}: ${error.message}`
      );
      throw error;
    }
  }

  async writeRegister(address, value) {
    await this.ensureConnection();
    try {
      await this.client.writeSingleRegister(address, value);
      logger.info(
        `Successfully wrote value ${value} to register at address ${address}`
      );
    } catch (error) {
      emitErrorEvent(
        this.socket,
        "MODBUS_WRITE_ERROR",
        `Error writing to register at address ${address}: ${error.message}`
      );
      this.handleError(error);
      throw error;
    }
  }

  async readBit(address, bitPosition, conti = true) {
    await this.ensureConnection();
    try {
      const result = await this.client.readHoldingRegisters(address, 1);
      const registerValue = result.response._body.valuesAsArray[0];
      const bitValue = (registerValue & (1 << bitPosition)) !== 0;

      if (conti) {
        logger.info(
          `Read bit ${bitPosition} from register ${address}: ${bitValue}`
        );
      }
      return bitValue;
    } catch (error) {
      console.log({ error });
      emitErrorEvent(
        this.socket,
        "MODBUS_READ_BIT_ERROR",
        `Error reading bit ${bitPosition} from register ${address}: ${error.message}`
      );
      this.handleError(error);
      throw error;
    }
  }

  async readBits(address, bitPositions) {
    await this.ensureConnection();
    try {
      const result = await this.client.readHoldingRegisters(address, 1);
      const registerValue = result.response._body.valuesAsArray[0];

      const bitValues = bitPositions.map((bitPosition) => {
        const bitValue = (registerValue & (1 << bitPosition)) !== 0;
        return { position: bitPosition, value: bitValue };
      });

      logger.info(
        `Read bits ${bitPositions.join(", ")} from register ${address}: ${JSON.stringify(bitValues)}`
      );
      return bitValues;
    } catch (error) {
      emitErrorEvent(
        this.socket,
        "MODBUS_READ_BITS_ERROR",
        `Error reading bits ${bitPositions.join(", ")} from register ${address}: ${error.message}`
      );
      this.handleError(error);
      throw error;
    }
  }

  async writeBit(address, bitPosition, value) {
    await this.ensureConnection();
    try {
      const result = await this.client.readHoldingRegisters(address, 1);
      const currentValue = result.response._body.valuesAsArray[0];
      const newValue = value
        ? currentValue | (1 << bitPosition)
        : currentValue & ~(1 << bitPosition);
      await this.client.writeSingleRegister(address, newValue);
      logger.info(
        `Successfully wrote bit ${bitPosition} with value ${value} to register ${address}`
      );
    } catch (error) {
      console.log({ error });
      emitErrorEvent(
        this.socket,
        "MODBUS_WRITE_BIT_ERROR",
        `Error writing bit ${bitPosition} to register ${address}: ${error.message}`
      );
      this.handleError(error);
      throw error;
    }
  }

  async writeRegistersFull(address, values) {
    await this.ensureConnection();
    try {
      logger.debug(`Writing values ${values} to register ${address}`);
      await this.client.writeMultipleRegisters(address, values);
      logger.info(`Successfully wrote values ${values} to register ${address}`);
    } catch (error) {
      logger.error(`Error writing to register ${address}:`, error);
      throw error;
    }
  }

  async writeBits(address, bitValues) {
    await this.ensureConnection();
    try {
      const result = await this.client.readHoldingRegisters(address, 1);
      let currentValue = result.response._body.valuesAsArray[0];

      for (const { position, value } of bitValues) {
        if (position < 0 || position > 15) {
          throw new Error(
            `Invalid bit position: ${position}. Must be between 0 and 15.`
          );
        }
        currentValue = value
          ? currentValue | (1 << position)
          : currentValue & ~(1 << position);
      }

      await this.client.writeSingleRegister(address, currentValue);
      logger.info(
        `Successfully wrote bits to register ${address}: ${JSON.stringify(bitValues)}`
      );
    } catch (error) {
      emitErrorEvent(
        this.socket,
        "MODBUS_WRITE_BITS_ERROR",
        `Error writing bits to register ${address}: ${error.message}`
      );
      this.handleError(error);
      throw error;
    }
  }

  async readDataAndConfirm(
    address,
    len,
    inputFeedbackBit,
    outputFeedbackBit,
    delay
  ) {
    await this.ensureConnection();

    try {
      const inputFeedback = await this.readBit(address, inputFeedbackBit);
      if (!inputFeedback) {
        logger.info(
          `Input feedback bit ${inputFeedbackBit} is not set. Aborting read.`
        );
        return null;
      }

      const asciiString = await this.readRegisterAndProvideASCII(address, len);
      logger.info(
        `Read data from address ${address} and converted to ASCII: ${asciiString}`
      );

      await this.writeBit(address, outputFeedbackBit, true);
      logger.info(
        `Set output feedback bit ${outputFeedbackBit} to confirm read success.`
      );

      setTimeout(async () => {
        await this.writeBit(address, outputFeedbackBit, false);
        logger.info(`Reset output feedback bit ${outputFeedbackBit}.`);
      }, delay);

      return asciiString;
    } catch (error) {
      emitErrorEvent(
        this.socket,
        "MODBUS_READ_CONFIRM_ERROR",
        `Error in readDataAndConfirm: ${error.message}`
      );
      this.handleError(error);
      throw error;
    }
  }

  handleError(error) {
    if (error.errno === "ETIMEDOUT" || error.errno === "ECONNRESET") {
      logger.warn(`Connection error: ${error.errno}. Scheduling reconnect.`);
      this.isConnected = false;
    }
  }
}

const modbusConnection = new ModbusConnection();

async function trackBits() {
  const register = 1700;
  const bitPositions = [0, 1, 2, 3];
  await modbusConnection.connect();

  try {
    while (true) {
      const result = await modbusConnection.readRegister(register, 1);
      const registerValue = result[0];
      const binaryString = registerValue.toString(2).padStart(16, "0");

      console.log(
        `16-bit register value for register ${register}: ${binaryString}`
      );

      bitPositions.forEach((bitPosition) => {
        const bitValue = (registerValue & (1 << bitPosition)) !== 0;
        console.log(
          `Bit ${bitPosition} in register ${register} is ${bitValue ? "1" : "0"}`
        );
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(
      `Error tracking bits in register ${register}: ${error.message}`
    );
  }
}

async function trackBits2() {
  const register = 1700;
  const bitPositions = [0, 1, 2, 3];
  await modbusConnection.connect();

  try {
    while (true) {
      const bitValues = await Promise.allSettled(
        bitPositions.map(async (bitPosition) => {
          const bitValue = await modbusConnection.readBit(
            register,
            bitPosition,
            true
          );
          console.log({ bitPosition, bitValue });
          return { bitPosition, bitValue };
        })
      );

      console.log({ a: JSON.stringify(bitValues) });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } catch (error) {
    console.error(
      `Error tracking bits in register ${register}: ${error.message}`
    );
  }
}

module.exports = {
  setSocket: (socket) => {
    modbusConnection.socket = socket;
  },
  connect: () => modbusConnection.connect(),
  readRegister: (address, len, conti = null, bit = null, isPrint = true) =>
    modbusConnection.readRegister(address, len, conti, bit, isPrint),
  writeRegister: (address, value) =>
    modbusConnection.writeRegister(address, value),
  readRegisterAndProvideASCII: (address, len) =>
    modbusConnection.readRegisterAndProvideASCII(address, len),
  readBit: (address, bitPosition, conti = false) =>
    modbusConnection.readBit(address, bitPosition, conti),
  writeBit: (address, bitPosition, value) =>
    modbusConnection.writeBit(address, bitPosition, value),
  readBits: (address, bitPositions) =>
    modbusConnection.readBits(address, bitPositions),
  writeBits: (address, bitValues) =>
    modbusConnection.writeBits(address, bitValues),
  writeBitsWithRest: (address, bitPosition, value, delay, isPrint = true) =>
    modbusConnection.writeBitWithReset(
      address,
      bitPosition,
      value,
      delay,
      isPrint
    ),
  readDataAndConfirm: (
    address,
    len,
    inputFeedbackBit,
    outputFeedbackBit,
    delay
  ) =>
    modbusConnection.readDataAndConfirm(
      address,
      len,
      inputFeedbackBit,
      outputFeedbackBit,
      delay
    ),
  writeRegisterFull: (add, val) =>
    modbusConnection.writeRegistersFull(add, val),
  trackBits,
  trackBits2,
};
