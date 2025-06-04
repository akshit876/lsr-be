import { connect, readRegister, readBit } from './services/modbus.js';
import process from 'process';

async function testConnection() {
  console.log('🔌 Testing basic Modbus connectivity...');
  
  try {
    // Test basic connection
    console.log('1. Attempting to connect...');
    await connect();
    console.log('✅ Connection successful!');
    
    // Test reading a simple register
    console.log('2. Testing register read...');
    try {
      const data = await readRegister(1410, 1, null, null, false);
      console.log(`✅ Register 1410 read successful: ${data[0]}`);
    } catch (error) {
      console.log(`❌ Register read failed: ${error.message}`);
      throw error;
    }
    
    // Test reading a bit
    console.log('3. Testing bit read...');
    try {
      const bitValue = await readBit(1410, 0, false);
      console.log(`✅ Bit 1410.0 read successful: ${bitValue}`);
    } catch (error) {
      console.log(`❌ Bit read failed: ${error.message}`);
      throw error;
    }
    
    console.log('🎉 All tests passed! Modbus connection is working.');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    console.error('💡 Please check:');
    console.error('   - PLC is powered on and connected');
    console.error('   - IP address 192.168.3.146 is correct');
    console.error('   - Port 502 is accessible');
    console.error('   - No firewall blocking the connection');
    process.exit(1);
  }
  
  process.exit(0);
}

testConnection(); 