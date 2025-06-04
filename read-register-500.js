import { connect, readRegister } from "./services/modbus.js";
import process from "process";

async function readRegister500() {
  try {
    console.log("🔌 Connecting to Modbus...");
    await connect();
    console.log("✅ Connected successfully!");

    console.log("📖 Reading register 500...");
    const data = await readRegister(500, 1);

    console.log(`📊 Register 500 value: ${data[0]}`);
    console.log(`📊 Raw data: [${data.join(", ")}]`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }

  process.exit(0);
}

// Run the script
readRegister500();
