import net from "net";
import fs from "fs";
import path, { dirname } from "path";

class TCPClient {
  constructor() {
    if (TCPClient.instance) {
      return TCPClient.instance;
    }

    this.client = null; // Holds the single instance of the client
    TCPClient.instance = this;
  }

  connect({ port, host }) {
    if (this.client) {
      console.log("Reusing existing TCP connection...");
      return Promise.resolve(this.client); // Return the existing connection
    }

    console.log(`Establishing new TCP connection to ${host}:${port}...`);
    return new Promise((resolve, reject) => {
      this.client = new net.Socket();

      this.client.connect(port, host, () => {
        console.log(`Connected to TCP server at ${host}:${port}`);
        resolve(this.client);
      });

      this.client.on("error", (err) => {
        console.error("TCP connection error:", err.message);
        this.client = null; // Reset client on error
        reject(err);
      });

      this.client.on("close", () => {
        console.log("TCP connection closed");
        this.client = null; // Reset client on close
      });
    });
  }

  async readData() {
    if (!this.client) {
      throw new Error("TCP client is not connected.");
    }

    return new Promise((resolve, reject) => {
      this.client.once("data", (data) => {
        resolve(data?.toString()?.trim());
      });

      this.client.on("error", (err) => {
        console.error("Error while receiving data:", err.message);
        reject(err);
      });
    });
  }

  async getDataTwiceAndConcat({ isFirst, isSecond, isThird }) {
    if (!this.client) {
      throw new Error("TCP client is not connected.");
    }

    console.log("Reading data from TCP server...");
    try {
      let completeData = "";
      while (!completeData.includes("\\")) {
        const data = await this.readData();
        completeData += data;
        console.log("Received data chunk:", data);
      }

      // Clean up the data by removing the backslash
      const cleanData = completeData.replace("\\", "").trim();
      console.log("Clean data:", cleanData);

      if (isFirst) {
        return cleanData.includes("0") ? "NG" : cleanData;
      }

      // For second scan, just take the first 7 characters (S113A5A)
      const secondScanData = cleanData.substring(0, 7);

      // For third scan trigger, combine the last two lines
      const thirdScanData = cleanData.slice(7).join("");

      // Save to CSV
      const csvPath = "D:/scanner_data.csv";
      if (!fs.existsSync(csvPath)) {
        fs.writeFileSync(csvPath, "Timestamp,Second Scan,Third Scan\n");
      }

      fs.appendFileSync(
        csvPath,
        `${new Date().toLocaleString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })},${secondScanData},${thirdScanData}\n`
      );

      return isSecond ? secondScanData : null;
    } catch (err) {
      throw new Error(`Failed to read data: ${err.message}`);
    }
  }

  close() {
    if (this.client) {
      console.log("Closing TCP connection...");
      this.client.destroy();
      this.client = null;
    }
  }
}

export const tcpClient = new TCPClient();

// (async () => {
//   const port = 5024; // Replace with your TCP port
//   const host = "192.168.3.147"; // Replace with your TCP host

//   try {
//     // Ensure a single instance of the client
//     await tcpClient.connect({ port, host });

//     console.log("Waiting for data from TCP server...");
//     const data = await tcpClient.getDataTwiceAndConcat();
//     console.log("Received data:", data);

//     // Process the data as needed
//   } catch (error) {
//     console.error("Error:", error.message);
//   } finally {
//     // Close the connection when done
//     tcpClient.close();
//   }
// })();
