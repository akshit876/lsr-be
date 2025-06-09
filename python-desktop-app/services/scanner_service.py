"""
TCP-based Scanner Service for the Python Desktop Application
Replaces the Node.js RS232 scanner with TCP communication
"""

import socket
import threading
import time
from typing import Optional, Callable, Dict, Any
from PyQt5.QtCore import QObject, pyqtSignal, QTimer, QThread
from utils.logger import get_logger


class ScannerWorker(QThread):
    """Worker thread for TCP scanner communication"""
    
    data_received = pyqtSignal(str)
    connection_status_changed = pyqtSignal(bool, str)
    error_occurred = pyqtSignal(str)
    
    def __init__(self, host: str, port: int, timeout: int = 10):
        super().__init__()
        self.host = host
        self.port = port
        self.timeout = timeout
        self.socket = None
        self.is_running = False
        self.is_connected = False
        self.data_buffer = ""
        self.logger = get_logger(__name__)
        
    def run(self):
        """Main worker thread loop"""
        self.is_running = True
        
        while self.is_running:
            try:
                if not self.is_connected:
                    self.connect_to_scanner()
                
                if self.is_connected:
                    self.listen_for_data()
                
            except Exception as e:
                self.logger.error(f"Scanner worker error: {e}")
                self.error_occurred.emit(str(e))
                self.disconnect_from_scanner()
                time.sleep(5)  # Wait before retry
    
    def connect_to_scanner(self):
        """Connect to the TCP scanner"""
        try:
            self.logger.info(f"Connecting to scanner at {self.host}:{self.port}")
            
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.settimeout(self.timeout)
            self.socket.connect((self.host, self.port))
            
            self.is_connected = True
            self.connection_status_changed.emit(True, "Connected")
            self.logger.success(f"Connected to scanner at {self.host}:{self.port}")
            
        except socket.timeout:
            error_msg = f"Connection timeout to {self.host}:{self.port}"
            self.logger.error(error_msg)
            self.connection_status_changed.emit(False, "Timeout")
            self.error_occurred.emit(error_msg)
            
        except socket.error as e:
            error_msg = f"Connection failed to {self.host}:{self.port} - {e}"
            self.logger.error(error_msg)
            self.connection_status_changed.emit(False, f"Failed: {e}")
            self.error_occurred.emit(error_msg)
            
        except Exception as e:
            error_msg = f"Unexpected error connecting to scanner: {e}"
            self.logger.error(error_msg)
            self.connection_status_changed.emit(False, f"Error: {e}")
            self.error_occurred.emit(error_msg)
    
    def disconnect_from_scanner(self):
        """Disconnect from the TCP scanner"""
        try:
            if self.socket:
                self.socket.close()
                self.socket = None
            
            self.is_connected = False
            self.connection_status_changed.emit(False, "Disconnected")
            self.logger.info("Disconnected from scanner")
            
        except Exception as e:
            self.logger.error(f"Error disconnecting from scanner: {e}")
    
    def listen_for_data(self):
        """Listen for data from the scanner"""
        try:
            if not self.socket:
                return
                
            self.socket.settimeout(1.0)  # Short timeout for non-blocking
            data = self.socket.recv(1024)
            
            if data:
                decoded_data = data.decode('utf-8', errors='ignore').strip()
                if decoded_data:
                    self.data_buffer += decoded_data
                    self.process_buffer()
            
        except socket.timeout:
            # Normal timeout, continue
            pass
            
        except socket.error as e:
            self.logger.error(f"Socket error while listening: {e}")
            self.disconnect_from_scanner()
            
        except Exception as e:
            self.logger.error(f"Error listening for data: {e}")
            self.error_occurred.emit(str(e))
    
    def process_buffer(self):
        """Process buffered data and extract complete messages"""
        # Check for complete messages (similar to Node.js implementation)
        if "@" in self.data_buffer:
            # Split by @ delimiter
            parts = self.data_buffer.split("@")
            # Process all complete messages except the last part
            for part in parts[:-1]:
                if part.strip():
                    self.data_received.emit(part.strip())
                    self.logger.scanner_data(part.strip(), "TCP Scanner")
            
            # Keep the last part as it might be incomplete
            self.data_buffer = parts[-1]
            
        elif "\n" in self.data_buffer or "\r" in self.data_buffer:
            # Split by newlines
            lines = self.data_buffer.replace('\r\n', '\n').replace('\r', '\n').split('\n')
            # Process all complete lines except the last one
            for line in lines[:-1]:
                if line.strip():
                    self.data_received.emit(line.strip())
                    self.logger.scanner_data(line.strip(), "TCP Scanner")
            
            # Keep the last line as it might be incomplete
            self.data_buffer = lines[-1]
    
    def send_command(self, command: str) -> bool:
        """Send a command to the scanner"""
        try:
            if not self.is_connected or not self.socket:
                return False
            
            command_bytes = command.encode('utf-8')
            self.socket.send(command_bytes)
            self.logger.info(f"Sent command to scanner: {command}")
            return True
            
        except Exception as e:
            self.logger.error(f"Error sending command: {e}")
            self.error_occurred.emit(f"Send command failed: {e}")
            return False
    
    def stop(self):
        """Stop the worker thread"""
        self.is_running = False
        self.disconnect_from_scanner()
        self.quit()
        self.wait()


class ScannerService(QObject):
    """Main TCP Scanner Service"""
    
    # Qt signals
    data_received = pyqtSignal(str)
    connection_status_changed = pyqtSignal(bool, str)
    error_occurred = pyqtSignal(str)
    
    def __init__(self, config):
        super().__init__()
        self.config = config
        self.logger = get_logger(__name__)
        
        # Scanner configuration
        scanner_config = config.get_scanner_config()
        self.host = scanner_config['host']
        self.port = scanner_config['port']
        self.timeout = scanner_config['timeout']
        self.reconnect_interval = scanner_config['reconnect_interval']
        
        # Worker thread
        self.worker = None
        self.is_initialized = False
        self.is_connected = False
        
        # Data handling
        self.data_callbacks = []
        self.last_data_time = None
        
    def initialize(self) -> bool:
        """Initialize the scanner service"""
        try:
            self.logger.section("TCP Scanner Service Initialization")
            self.logger.info(f"Scanner Host: {self.host}")
            self.logger.info(f"Scanner Port: {self.port}")
            self.logger.info(f"Timeout: {self.timeout}s")
            
            # Create worker thread
            self.worker = ScannerWorker(self.host, self.port, self.timeout)
            
            # Connect signals
            self.worker.data_received.connect(self.on_data_received)
            self.worker.connection_status_changed.connect(self.on_connection_status_changed)
            self.worker.error_occurred.connect(self.on_error_occurred)
            
            # Start worker
            self.worker.start()
            
            self.is_initialized = True
            self.logger.success("Scanner service initialized successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to initialize scanner service: {e}")
            return False
    
    def on_data_received(self, data: str):
        """Handle data received from scanner"""
        self.last_data_time = time.time()
        self.data_received.emit(data)
        
        # Call registered callbacks
        for callback in self.data_callbacks:
            try:
                callback(data)
            except Exception as e:
                self.logger.error(f"Error in data callback: {e}")
    
    def on_connection_status_changed(self, connected: bool, status: str):
        """Handle connection status changes"""
        self.is_connected = connected
        self.logger.connection_status("TCP Scanner", status)
        self.connection_status_changed.emit(connected, status)
    
    def on_error_occurred(self, error_message: str):
        """Handle errors from worker thread"""
        self.logger.error(f"Scanner error: {error_message}")
        self.error_occurred.emit(error_message)
    
    def add_data_callback(self, callback: Callable[[str], None]):
        """Add a callback for data reception"""
        self.data_callbacks.append(callback)
    
    def remove_data_callback(self, callback: Callable[[str], None]):
        """Remove a data callback"""
        if callback in self.data_callbacks:
            self.data_callbacks.remove(callback)
    
    def send_command(self, command: str) -> bool:
        """Send a command to the scanner"""
        if self.worker and self.is_connected:
            return self.worker.send_command(command)
        else:
            self.logger.warning("Cannot send command - scanner not connected")
            return False
    
    def trigger_scan(self) -> bool:
        """Trigger a scan operation"""
        # This would typically send a trigger command to the scanner
        # The exact command depends on your scanner model
        return self.send_command("TRIGGER\r\n")
    
    def get_connection_info(self) -> Dict[str, Any]:
        """Get connection information"""
        return {
            'host': self.host,
            'port': self.port,
            'connected': self.is_connected,
            'last_data_time': self.last_data_time,
            'initialized': self.is_initialized
        }
    
    def test_connection(self) -> bool:
        """Test the scanner connection"""
        try:
            test_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            test_socket.settimeout(5)
            result = test_socket.connect_ex((self.host, self.port))
            test_socket.close()
            
            success = result == 0
            if success:
                self.logger.success("Scanner connection test passed")
            else:
                self.logger.error("Scanner connection test failed")
            
            return success
            
        except Exception as e:
            self.logger.error(f"Scanner connection test error: {e}")
            return False
    
    def stop(self):
        """Stop the scanner service"""
        try:
            self.logger.info("Stopping scanner service...")
            
            if self.worker:
                self.worker.stop()
                self.worker = None
            
            self.is_initialized = False
            self.is_connected = False
            self.logger.success("Scanner service stopped")
            
        except Exception as e:
            self.logger.error(f"Error stopping scanner service: {e}")
    
    def restart(self):
        """Restart the scanner service"""
        self.logger.info("Restarting scanner service...")
        self.stop()
        time.sleep(1)
        return self.initialize()
    
    def update_configuration(self, host: str = None, port: int = None, timeout: int = None):
        """Update scanner configuration"""
        try:
            restart_needed = False
            
            if host and host != self.host:
                self.host = host
                restart_needed = True
            
            if port and port != self.port:
                self.port = port
                restart_needed = True
            
            if timeout and timeout != self.timeout:
                self.timeout = timeout
                restart_needed = True
            
            if restart_needed and self.is_initialized:
                self.restart()
            
            self.logger.info("Scanner configuration updated")
            
        except Exception as e:
            self.logger.error(f"Error updating scanner configuration: {e}")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current scanner status"""
        return {
            'initialized': self.is_initialized,
            'connected': self.is_connected,
            'host': self.host,
            'port': self.port,
            'timeout': self.timeout,
            'last_data_time': self.last_data_time,
            'callbacks_registered': len(self.data_callbacks)
        } 