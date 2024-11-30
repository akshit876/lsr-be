import net from "net";

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

  async getDataTwiceAndConcat({ isFirst = true, isSecond = false }) {
    if (!this.client) {
      throw new Error("TCP client is not connected.");
    }

    console.log("Reading data from TCP server...");
    try {
      const firstData = await this.readData();
      console.log("First data received:", { firstData });
      let concatenatedData = firstData;
      if (firstData == "0\r\n0" || firstData == "0") {
        concatenatedData = "NG";
      }

      if (isSecond && concatenatedData != "NG") {
        const secondData = await this.readData();
        console.log("Second data received:", { secondData });
        concatenatedData += secondData;
        console.log("Concatenated data:", concatenatedData);
      }

      return concatenatedData;
    } catch (err) {
      throw new Error(`Failed to read data twice: ${err.message}`);
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
