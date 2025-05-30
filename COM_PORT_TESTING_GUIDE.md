# COM Port Testing Guide

This guide provides multiple ways to test your COM3 port and scanner communication.

## 🚀 Quick Tests (Choose One)

### Option 1: Quick Test (Recommended)

```bash
# Run as Administrator
node quick-comport-test.js
```

### Option 2: Full Test Suite

```bash
# Run as Administrator
node test-comport.js
```

## 🔧 Manual Testing Methods

### Method 1: Using PuTTY (Windows)

1. **Download PuTTY** if not installed
2. **Open PuTTY**
3. **Configure Connection:**
   - Connection Type: `Serial`
   - Serial Line: `COM3`
   - Speed: `9600`
4. **Click "Open"**
5. **Test:**
   - Type some text and press Enter
   - Scan a barcode if scanner is connected
   - Check if data appears in the terminal

### Method 2: Using Windows Terminal/PowerShell

```powershell
# Check if COM3 exists
mode COM3

# Or use .NET method
[System.IO.Ports.SerialPort]::GetPortNames()
```

### Method 3: Using Arduino IDE Serial Monitor

1. **Open Arduino IDE**
2. **Go to Tools → Serial Monitor**
3. **Select COM3 and 9600 baud**
4. **Try sending data or scanning barcodes**

## 🧪 Test Scenarios

### Scenario 1: Scanner Connected but No Data

**Symptoms:** Port opens successfully, no data received  
**Possible Causes:**

- Scanner not powered on
- Scanner needs manual trigger
- Wrong baud rate configuration
- Scanner in wrong mode

**Solutions:**

- Check scanner power LED
- Try manual scan button (if available)
- Try different baud rates (4800, 19200, 38400)
- Check scanner configuration manual

### Scenario 2: Access Denied Error

**Symptoms:** "Opening COM3: Access denied"  
**Solutions:**

- Run terminal as Administrator
- Close Arduino IDE, PuTTY, other COM port programs
- Stop other Node.js processes
- Unplug/reconnect USB device

### Scenario 3: Port Not Found

**Symptoms:** "File not found" or "cannot open COM3"  
**Solutions:**

- Check Device Manager for COM ports
- Verify USB cable connection
- Try different USB port
- Check driver installation

## 📊 Expected Test Results

### ✅ Successful Test Output:

```
📡 Testing COM3 connection...
✅ COM3 connected successfully!
👂 Listening for data for 10 seconds...
📥 Data received: "1234567890"
📊 Data length: 10 characters
✅ Data reception test PASSED!
```

### ⚠️ No Data Received:

```
📡 Testing COM3 connection...
✅ COM3 connected successfully!
👂 Listening for data for 10 seconds...
⚠️ No data received during test period
💡 Possible reasons: [see troubleshooting above]
```

### ❌ Connection Failed:

```
❌ Error: Opening COM3: Access denied
💡 Solution: Run as Administrator
```

## 🛠️ Troubleshooting Commands

### Check Available COM Ports:

```powershell
Get-WmiObject -Class Win32_PnPEntity | Where-Object {$_.Name -match "COM\d+"} | Select-Object Name, DeviceID
```

### Check COM3 Specific Info:

```powershell
Get-WmiObject -Class Win32_SerialPort | Where-Object {$_.DeviceID -eq "COM3"}
```

### Test Different Baud Rates:

Edit the test files and try these common rates:

- 4800
- 9600 (default)
- 19200
- 38400
- 57600
- 115200

## 🔄 Alternative Ports

If COM3 doesn't work, try testing with:

- COM1 (if available)
- COM4, COM5, etc.

Edit the test files:

```javascript
const TEST_CONFIG = {
  path: "COM1", // Change this
  baudRate: 9600,
  logDir: "test_logs",
};
```

## 📞 Getting Help

If tests still fail, collect this information:

1. **Operating System:** Windows version
2. **Device Manager:** Screenshot of COM ports section
3. **Scanner Model:** Manufacturer and model number
4. **Error Messages:** Exact error text from tests
5. **USB Connection:** Direct to PC or through hub
6. **Other Software:** Any other programs using COM ports

## 🎯 Next Steps

Once COM port communication is working:

1. **Test with main application** to see if PLC triggers work
2. **Configure scanner settings** if needed
3. **Verify barcode scanning** with actual labels
4. **Test full workflow** integration

---

**Need immediate help?** Run the quick test first:

```bash
node quick-comport-test.js
```
