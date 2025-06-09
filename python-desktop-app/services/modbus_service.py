"""
Modbus Service for PLC Communication
Python implementation of the Node.js Modbus functionality
"""

import time
from typing import Optional, List, Union, Dict, Any
from pymodbus.client.sync import ModbusTcpClient
from pymodbus.exceptions import ModbusException, ConnectionException
from PyQt5.QtCore import QObject, pyqtSignal, QTimer
from utils.logger import get_logger


class ModbusService(QObject):
    """Modbus TCP service for PLC communication"""
    
    # Qt signals
    connection_status_changed = pyqtSignal(bool, str)
    register_read = pyqtSignal(int, list)
    register_written = pyqtSignal(int, int)
    bit_read = pyqtSignal(int, int, bool)
    bit_written = pyqtSignal(int, int, bool)
    error_occurred = pyqtSignal(str)
    
    def __init__(self, config):
        super().__init__()
        self.config = config
        self.logger = get_logger(__name__)
        
        # Modbus configuration
        modbus_config = config.get_modbus_config()
        self.host = modbus_config['host']
        self.port = modbus_config['port']
        self.slave_id = modbus_config['slave_id']
        self.timeout = modbus_config['timeout']
        
        # Modbus client
        self.client = None
        self.is_connected = False
        self.is_initialized = False
        
        # Connection monitoring
        self.connection_timer = QTimer()
        self.connection_timer.timeout.connect(self.check_connection)
        self.connection_timer.setInterval(5000)  # Check every 5 seconds
        
    def initialize(self) -> bool:
        """Initialize the Modbus service"""
        try:
            self.logger.section("Modbus Service Initialization")
            self.logger.info(f"PLC Host: {self.host}")
            self.logger.info(f"PLC Port: {self.port}")
            self.logger.info(f"Slave ID: {self.slave_id}")
            self.logger.info(f"Timeout: {self.timeout}s")
            
            # Create Modbus TCP client
            self.client = ModbusTcpClient(
                host=self.host,
                port=self.port,
                timeout=self.timeout
            )
            
            # Connect to PLC
            if self.connect():
                self.is_initialized = True
                self.connection_timer.start()
                self.logger.success("Modbus service initialized successfully")
                return True
            else:
                self.logger.error("Failed to connect to PLC during initialization")
                return False
                
        except Exception as e:
            self.logger.error(f"Failed to initialize Modbus service: {e}")
            return False
    
    def connect(self) -> bool:
        """Connect to the PLC"""
        try:
            if not self.client:
                self.logger.error("Modbus client not initialized")
                return False
            
            self.logger.info(f"Connecting to PLC at {self.host}:{self.port}")
            
            if self.client.connect():
                self.is_connected = True
                self.connection_status_changed.emit(True, "Connected")
                self.logger.success(f"Connected to PLC at {self.host}:{self.port}")
                return True
            else:
                self.is_connected = False
                self.connection_status_changed.emit(False, "Connection failed")
                self.logger.error("Failed to connect to PLC")
                return False
                
        except Exception as e:
            self.is_connected = False
            error_msg = f"Error connecting to PLC: {e}"
            self.logger.error(error_msg)
            self.connection_status_changed.emit(False, f"Error: {e}")
            self.error_occurred.emit(error_msg)
            return False
    
    def disconnect(self):
        """Disconnect from the PLC"""
        try:
            if self.client and self.is_connected:
                self.client.close()
                self.is_connected = False
                self.connection_status_changed.emit(False, "Disconnected")
                self.logger.info("Disconnected from PLC")
            
            if self.connection_timer.isActive():
                self.connection_timer.stop()
                
        except Exception as e:
            self.logger.error(f"Error disconnecting from PLC: {e}")
    
    def check_connection(self):
        """Check and maintain PLC connection"""
        if not self.is_connected:
            self.logger.info("Attempting to reconnect to PLC...")
            self.connect()
    
    def read_register(self, address: int, count: int = 1) -> Optional[List[int]]:
        """
        Read holding registers from PLC
        
        Args:
            address: Starting register address
            count: Number of registers to read
            
        Returns:
            List of register values or None if error
        """
        try:
            if not self.ensure_connection():
                return None
            
            self.logger.modbus_operation("Read", address, f"count={count}")
            
            result = self.client.read_holding_registers(address, count, unit=self.slave_id)
            
            if result.isError():
                error_msg = f"Error reading registers {address}: {result}"
                self.logger.error(error_msg)
                self.error_occurred.emit(error_msg)
                return None
            
            values = result.registers
            self.logger.modbus_operation("Read Result", address, values)
            self.register_read.emit(address, values)
            return values
            
        except Exception as e:
            error_msg = f"Exception reading registers {address}: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return None
    
    def write_register(self, address: int, value: int) -> bool:
        """
        Write a holding register to PLC
        
        Args:
            address: Register address
            value: Value to write
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if not self.ensure_connection():
                return False
            
            self.logger.modbus_operation("Write", address, value)
            
            result = self.client.write_register(address, value, unit=self.slave_id)
            
            if result.isError():
                error_msg = f"Error writing register {address}: {result}"
                self.logger.error(error_msg)
                self.error_occurred.emit(error_msg)
                return False
            
            self.logger.success(f"Successfully wrote {value} to register {address}")
            self.register_written.emit(address, value)
            return True
            
        except Exception as e:
            error_msg = f"Exception writing register {address}: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return False
    
    def read_bit(self, address: int, bit_position: int) -> Optional[bool]:
        """
        Read a specific bit from a holding register
        
        Args:
            address: Register address
            bit_position: Bit position (0-15)
            
        Returns:
            Bit value (True/False) or None if error
        """
        try:
            if not (0 <= bit_position <= 15):
                raise ValueError(f"Bit position must be 0-15, got {bit_position}")
            
            register_values = self.read_register(address, 1)
            if register_values is None:
                return None
            
            register_value = register_values[0]
            bit_value = bool(register_value & (1 << bit_position))
            
            self.logger.modbus_operation("Read Bit", address, f"bit {bit_position} = {bit_value}")
            self.bit_read.emit(address, bit_position, bit_value)
            return bit_value
            
        except Exception as e:
            error_msg = f"Exception reading bit {bit_position} from register {address}: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return None
    
    def write_bit(self, address: int, bit_position: int, value: bool) -> bool:
        """
        Write a specific bit in a holding register
        
        Args:
            address: Register address
            bit_position: Bit position (0-15)
            value: Bit value to write
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if not (0 <= bit_position <= 15):
                raise ValueError(f"Bit position must be 0-15, got {bit_position}")
            
            # Read current register value
            register_values = self.read_register(address, 1)
            if register_values is None:
                return False
            
            current_value = register_values[0]
            
            # Modify the specific bit
            if value:
                new_value = current_value | (1 << bit_position)
            else:
                new_value = current_value & ~(1 << bit_position)
            
            # Write the modified value back
            if self.write_register(address, new_value):
                self.logger.success(f"Successfully wrote bit {bit_position} = {value} to register {address}")
                self.bit_written.emit(address, bit_position, value)
                return True
            else:
                return False
                
        except Exception as e:
            error_msg = f"Exception writing bit {bit_position} to register {address}: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return False
    
    def read_ascii_string(self, address: int, length: int) -> Optional[str]:
        """
        Read ASCII string from consecutive holding registers
        
        Args:
            address: Starting register address
            length: Number of registers to read
            
        Returns:
            ASCII string or None if error
        """
        try:
            values = self.read_register(address, length)
            if values is None:
                return None
            
            # Convert register values to ASCII characters
            ascii_chars = []
            for value in values:
                # Each register contains 2 ASCII characters
                high_byte = (value >> 8) & 0xFF
                low_byte = value & 0xFF
                
                if high_byte > 0:
                    ascii_chars.append(chr(high_byte))
                if low_byte > 0:
                    ascii_chars.append(chr(low_byte))
            
            ascii_string = ''.join(ascii_chars).strip('\x00').strip()
            self.logger.info(f"Read ASCII string from register {address}: '{ascii_string}'")
            return ascii_string
            
        except Exception as e:
            error_msg = f"Exception reading ASCII string from register {address}: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return None
    
    def wait_for_bit(self, address: int, bit_position: int, expected_value: bool, 
                    timeout: float = 30.0, check_interval: float = 0.1) -> bool:
        """
        Wait for a specific bit to reach the expected value
        
        Args:
            address: Register address
            bit_position: Bit position (0-15)
            expected_value: Expected bit value
            timeout: Maximum wait time in seconds
            check_interval: Check interval in seconds
            
        Returns:
            True if bit reached expected value, False if timeout
        """
        try:
            self.logger.info(f"Waiting for bit {address}.{bit_position} to become {expected_value}")
            
            start_time = time.time()
            while time.time() - start_time < timeout:
                bit_value = self.read_bit(address, bit_position)
                
                if bit_value is None:
                    time.sleep(check_interval)
                    continue
                
                if bit_value == expected_value:
                    self.logger.success(f"Bit {address}.{bit_position} reached expected value {expected_value}")
                    return True
                
                time.sleep(check_interval)
            
            self.logger.warning(f"Timeout waiting for bit {address}.{bit_position} to become {expected_value}")
            return False
            
        except Exception as e:
            error_msg = f"Exception waiting for bit {address}.{bit_position}: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return False
    
    def ensure_connection(self) -> bool:
        """Ensure connection to PLC is active"""
        if not self.is_connected:
            return self.connect()
        return True
    
    def test_connection(self) -> bool:
        """Test the PLC connection"""
        try:
            # Try to read a register to test connection
            result = self.read_register(1400, 1)
            success = result is not None
            
            if success:
                self.logger.success("PLC connection test passed")
            else:
                self.logger.error("PLC connection test failed")
            
            return success
            
        except Exception as e:
            self.logger.error(f"PLC connection test error: {e}")
            return False
    
    def get_connection_info(self) -> Dict[str, Any]:
        """Get connection information"""
        return {
            'host': self.host,
            'port': self.port,
            'slave_id': self.slave_id,
            'connected': self.is_connected,
            'initialized': self.is_initialized,
            'timeout': self.timeout
        }
    
    def update_configuration(self, host: str = None, port: int = None, 
                           slave_id: int = None, timeout: int = None):
        """Update Modbus configuration"""
        try:
            restart_needed = False
            
            if host and host != self.host:
                self.host = host
                restart_needed = True
            
            if port and port != self.port:
                self.port = port
                restart_needed = True
            
            if slave_id and slave_id != self.slave_id:
                self.slave_id = slave_id
                restart_needed = True
            
            if timeout and timeout != self.timeout:
                self.timeout = timeout
                restart_needed = True
            
            if restart_needed and self.is_initialized:
                self.restart()
            
            self.logger.info("Modbus configuration updated")
            
        except Exception as e:
            self.logger.error(f"Error updating Modbus configuration: {e}")
    
    def restart(self):
        """Restart the Modbus service"""
        self.logger.info("Restarting Modbus service...")
        self.disconnect()
        time.sleep(1)
        return self.initialize()
    
    def stop(self):
        """Stop the Modbus service"""
        try:
            self.logger.info("Stopping Modbus service...")
            
            if self.connection_timer.isActive():
                self.connection_timer.stop()
            
            self.disconnect()
            
            self.is_initialized = False
            self.logger.success("Modbus service stopped")
            
        except Exception as e:
            self.logger.error(f"Error stopping Modbus service: {e}")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current Modbus status"""
        return {
            'initialized': self.is_initialized,
            'connected': self.is_connected,
            'host': self.host,
            'port': self.port,
            'slave_id': self.slave_id,
            'timeout': self.timeout,
            'monitoring_active': self.connection_timer.isActive()
        } 