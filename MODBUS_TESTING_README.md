# Modbus Connection Testing

This directory contains scripts to test Modbus connections and verify that the PLC communication is working properly.

## Available Test Scripts

### 1. **`quick-modbus-test.js`** - Quick Connection Test

A simple, fast test that:

- Connects to Modbus
- Writes a value to a register
- Reads it back
- Verifies the values match
- Cleans up by resetting the register

**Usage:**

```bash
node quick-modbus-test.js
```

**Best for:** Quick verification that Modbus is working

### 2. **`test-modbus-connection.js`** - Comprehensive Test Suite

A full test suite that performs:

- Basic connection test
- Register write/read verification
- Bit write/read verification
- Multiple register operations
- Detailed results reporting
- Automatic cleanup

**Usage:**

```bash
node test-modbus-connection.js
```

**Best for:** Thorough testing and debugging

### 3. **`startup-check.js`** - System Health Check

Checks all system dependencies including:

- Modbus connection
- MongoDB connection
- Port availability
- Service dependencies

**Usage:**

```bash
node startup-check.js
```

**Best for:** Diagnosing startup issues

## Test Register Addresses

The test scripts use these safe register addresses:

- **Register 1000**: Main test register
- **Register 1001-1003**: Multiple register test
- **Bit 0**: Bit operation test

⚠️ **Important**: These addresses are chosen to avoid conflicts with production PLC registers.

## Environment Variables

Make sure these are set before running tests:

```bash
# Modbus connection
export MODBUS_IP="192.168.1.100"  # Your PLC IP address
export MODBUS_PORT="502"           # Modbus port (usually 502)

# MongoDB (for startup checks)
export MONGODB_URI="mongodb://localhost:27017"

# Server port
export PORT="3002"
```

## Expected Output

### Successful Test Output:

```
🔌 Quick Modbus Test
🔌 Connecting to Modbus...
✅ Connected successfully
📝 Writing 12345 to register 1000...
✅ Write successful
📖 Reading register 1000...
✅ Read successful: 12345
🎉 Test passed! Write and read values match.
🧹 Cleaning up...
✅ Cleanup completed
```

### Failed Test Output:

```
🔌 Quick Modbus Test
🔌 Connecting to Modbus...
❌ Test failed: Connection timeout
💥 Fatal error: Connection timeout
```

## Troubleshooting

### Common Issues:

1. **Connection Timeout**

   - Check PLC IP address and port
   - Verify network connectivity
   - Check firewall settings

2. **Permission Denied**

   - Ensure PLC allows write access to test registers
   - Check user permissions

3. **Register Not Found**

   - Verify register addresses exist on your PLC
   - Check PLC configuration

4. **Value Mismatch**
   - PLC might be overwriting values
   - Check for other processes writing to registers
   - Verify register data type compatibility

### Debug Steps:

1. **Run startup checks first:**

   ```bash
   node startup-check.js
   ```

2. **Test basic connectivity:**

   ```bash
   node quick-modbus-test.js
   ```

3. **Run comprehensive tests:**

   ```bash
   node test-modbus-connection.js
   ```

4. **Check logs for detailed error messages**

## Integration with Main System

These test scripts use the same Modbus service (`./services/modbus.js`) as the main application, ensuring:

- **Consistent configuration** - Same connection parameters
- **Same error handling** - Identical behavior in production
- **Service validation** - Verifies the service works correctly

## Safety Features

- **Automatic cleanup** - Test registers are reset to 0
- **Safe addresses** - Uses non-production register ranges
- **Error handling** - Graceful failure without system impact
- **Logging** - Detailed output for debugging

## Running Tests in CI/CD

For automated testing, you can run:

```bash
# Quick test (fast, basic)
node quick-modbus-test.js

# Full test suite (comprehensive)
node test-modbus-connection.js

# Exit codes: 0 = success, 1 = failure
```

## Customization

To test different registers or values, modify the test scripts:

```javascript
// In quick-modbus-test.js
const testRegister = 2000; // Change register address
const testValue = 9999; // Change test value
```

⚠️ **Warning**: Only test on registers that are safe to write to. Never test on production control registers.

## Support

If tests fail:

1. Check the troubleshooting section above
2. Verify environment variables are set correctly
3. Ensure PLC is accessible from your network
4. Check PLC configuration and permissions
5. Review detailed error logs for specific issues
