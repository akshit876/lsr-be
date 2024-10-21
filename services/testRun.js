// import BufferedComPortService from "./ComPortService.js";
import { writeBitsWithRest } from "./modbus.js";
// import { sleep } from "./testCycle.js";

// const comService = new BufferedComPortService({
//   path: "COM3",
//   baudRate: 9600,
//   logDir: "com_port_logs",
// });

async function runn() {
  try {
    // console.log("Attempting to initialize serial port...");
    // await comService.initSerialPort();
    // console.log("Initialized serial port successfully");

    // while (true) {
    //   try {
    await writeBitsWithRest(1417, 0, 1, 100, false);
    // Wait for the next data event before proceeding
    //     const scannerData = await new Promise((resolve) => {
    //       comService.once("data", resolve);
    //     });

    //     console.log("=== STARTING NEW SCAN CYCLE ===");
    //     console.log(
    //       "-----------------------------------------------------------------------------------------------------------"
    //     );
    //     console.log(`Received scanner data: ${scannerData}`);

    //     // Process the scanner data after receiving it

    //     // Optional delay before the next cycle, if needed
    //     await sleep(5 * 1000);
    //   } catch (error) {
    //     console.error("Error processing data:", error);
    //   }
    // }
  } catch (comError) {
    console.log("Failed to initialize serial port:", comError);
    console.log("Retrying in 5 seconds...");
    // await sleep(5000);
  }
}

runn();
