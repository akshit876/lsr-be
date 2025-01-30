import logger from "../../logger.js";
import { readRegister, writeRegister, readBit, writeBit } from "../modbus.js";
import { sleep } from "../utils.js";

export class BitOperations {
  static async resetBits() {
    try {
      logger.info("🔄 Resetting bits...");
      await Promise.all([
        this.resetSpecificBits(1414, [3, 4, 6, 7]),
        this.resetSpecificBits(1415, [4]),
      ]);
      await sleep(500);
      logger.success("Bits reset successfully");
    } catch (error) {
      logger.error("Error in resetBits:", error);
      throw error;
    }
  }

  static async resetSpecificBits(register, bitsToReset) {
    try {
      logger.info(
        `🎯 Resetting bits ${bitsToReset.join(", ")} in register ${register}`
      );
      const [currentValue] = await readRegister(register, 1);
      const mask = bitsToReset.reduce(
        (mask, bit) => mask & ~(1 << bit),
        0xffff
      );
      const newValue = currentValue & mask;

      const writePromise = writeRegister(register, newValue);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Timeout resetting bits in register ${register}`)),
          5000
        )
      );

      await Promise.race([writePromise, timeoutPromise]);
      await sleep(50);
      logger.success(
        `Reset complete for bits ${bitsToReset.join(", ")} in register ${register}`
      );
    } catch (error) {
      logger.error(`Error resetting bits in register ${register}:`, error);
      throw error;
    }
  }
}
