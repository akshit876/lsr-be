import { SerialPort } from "serialport";

export class MockSerialPort extends SerialPort {
  constructor(options) {
    super(options);
    this.mockData = ["NG"];
  }

  write(data) {
    console.log("Mock write:", data.toString());
    this.mockData.push(data);
    this.emit("data", Buffer.from(data));
  }

  startMocking() {
    setInterval(() => {
      if (this.mockData.length > 0) {
        const data = this.mockData.shift();
        this.emit("data", Buffer.from(data));
      }
    }, 5000); // Emit mock data every second
  }

  open(callback) {
    // Simulate the port opening successfully
    if (callback) {
      callback(null);
    }
    this.emit("open");
  }
}
// /demo