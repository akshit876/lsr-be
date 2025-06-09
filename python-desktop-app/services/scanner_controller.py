"""
Scanner Controller - Main Business Logic
Equivalent to scanCycles.js from Node.js version
"""

import asyncio
import json
import os
import time
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Callable
import signal
import sys

from services.scanner_service import ScannerService
from services.modbus_service import ModbusService
from services.database_service import DatabaseService
from utils.logger import logger
from utils.config import config


class ScannerController:
    """
    Main scanner controller class that orchestrates all scanning operations.
    This is the equivalent of the ScannerController class in scanCycles.js
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        """Singleton pattern implementation"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize the scanner controller"""
        if hasattr(self, '_initialized'):
            return
            
        logger.section("Scanner Controller Initialization")
        
        # Initialize instance variables
        self.is_initialized = False
        self.is_running = False
        self.cycle_count = 0
        self.current_day_id = 1
        self.last_reset_date = self._get_last_reset_time()
        
        # Service instances
        self.scanner_service: Optional[ScannerService] = None
        self.modbus_service: Optional[ModbusService] = None
        self.database_service: Optional[DatabaseService] = None
        
        # Threading and async control
        self.reset_monitor = None
        self.reset_monitor_task = None
        self.reset_event = asyncio.Event()
        self.reset_listeners: Set[Callable] = set()
        self.shutdown_handlers_set = False
        self.reset_monitoring_active = False
        
        # Configuration
        self.timeout = config.get('scanner.timeout', 100000)  # 100 seconds default
        self.data_dir = config.get('app.data_directory', 'data')
        
        # File paths
        os.makedirs(self.data_dir, exist_ok=True)
        self.code_file_path = os.path.join(self.data_dir, 'code.txt')
        self.text_file_path = os.path.join(self.data_dir, 'text.txt')
        
        self._setup_shutdown_handlers()
        self._initialized = True
        
        logger.success("Scanner controller instance created")
    
    async def initialize(self) -> None:
        """Initialize all services and connections"""
        logger.section("Scanner Controller Initialization")
        
        if self.is_initialized:
            logger.warn("⚠️ Scanner controller already initialized")
            return
        
        try:
            logger.info("🚀 Starting initialization sequence")
            
            # Initialize database service
            logger.info("📦 Initializing database service...")
            self.database_service = DatabaseService()
            await self.database_service.connect()
            logger.success("Database service initialized")
            
            # Initialize Modbus service
            logger.info("🔌 Initializing Modbus service...")
            self.modbus_service = ModbusService()
            await self.modbus_service.connect()
            logger.success("Modbus service initialized")
            
            # Initialize scanner service
            logger.info("📱 Initializing scanner service...")
            self.scanner_service = ScannerService()
            await self.scanner_service.connect()
            logger.success("Scanner service initialized")
            
            # Start concurrent reset monitoring
            logger.info("🔄 Starting concurrent reset monitoring...")
            await self._start_reset_monitoring()
            
            self.is_initialized = True
            logger.success("Scanner controller initialization complete")
            
        except Exception as error:
            logger.error(f"❌ Error during initialization: {error}")
            self.is_initialized = False
            
            # Retry logic for database connection
            if "database" in str(error).lower():
                logger.info("⏳ Waiting 5 seconds before retrying database connection")
                await asyncio.sleep(5)
                return await self.initialize()
            
            raise error
    
    async def reset_bits(self) -> None:
        """Reset specific bits in Modbus registers"""
        logger.info("🔄 Resetting bits...")
        try:
            await self._reset_specific_bits(1414, [3, 4, 6, 7])
            await self._reset_specific_bits(1415, [4])
            logger.success("Bits reset successfully")
        except Exception as error:
            logger.error(f"❌ Error resetting bits: {error}")
            raise
    
    async def _reset_specific_bits(self, register: int, bits_to_reset: List[int]) -> None:
        """Reset specific bits in a Modbus register"""
        try:
            logger.info(f"🎯 Resetting bits {bits_to_reset} in register {register}")
            
            if not all(0 <= bit <= 15 for bit in bits_to_reset):
                raise ValueError("Invalid bits array. Must be numbers 0-15")
            
            # Read current value
            current_value = await self.modbus_service.read_register(register)
            
            # Create mask to reset specific bits
            mask = 0xFFFF
            for bit in bits_to_reset:
                mask &= ~(1 << bit)
            
            new_value = current_value & mask
            
            # Write new value with timeout
            await asyncio.wait_for(
                self.modbus_service.write_register(register, new_value),
                timeout=self.timeout / 1000
            )
            
            logger.success(f"Reset complete for bits {bits_to_reset} in register {register}")
            
        except Exception as error:
            logger.error(f"❌ Error resetting bits in register {register}: {error}")
            raise
    
    async def run_continuous_scan(self, part_number: str, scan_callback: Optional[Callable] = None) -> None:
        """
        Main scanning loop - equivalent to runContinuousScan in Node.js
        """
        logger.section(f"Starting Continuous Scan for Part: {part_number}")
        
        if not self.is_initialized:
            raise RuntimeError("Scanner controller not initialized")
        
        self.is_running = True
        self.cycle_count = 0
        
        try:
            while self.is_running:
                try:
                    # Execute single scan cycle
                    scan_result = await self._execute_scan_cycle(part_number)
                    
                    # Call callback if provided
                    if scan_callback:
                        await scan_callback(scan_result)
                    
                    self.cycle_count += 1
                    logger.info(f"🔄 Completed scan cycle {self.cycle_count}")
                    
                    # Small delay between cycles
                    await asyncio.sleep(0.1)
                    
                except Exception as error:
                    await self._handle_scan_error(error)
                    await asyncio.sleep(1)  # Wait before retry
                    
        except Exception as error:
            logger.error(f"❌ Critical error in continuous scan: {error}")
            raise
        finally:
            self.is_running = False
            logger.info("🛑 Continuous scan stopped")
    
    async def _execute_scan_cycle(self, part_number: str) -> Dict:
        """
        Execute a single scan cycle - equivalent to executeScanCycle in Node.js
        """
        try:
            # Check if reset event was triggered by concurrent monitor
            if self.reset_event.is_set():
                logger.info("🔄 Reset event detected by concurrent monitor")
                await self._handle_reset()
                self.reset_event.clear()  # Clear the event after handling
                return {"type": "reset", "timestamp": datetime.now().isoformat()}
            
            # Generate and write barcode data
            barcode_data = await self._generate_and_write_barcode(part_number)
            
            # Wait for scan trigger
            await self._wait_for_scan_trigger()
            
            # Fetch scanner data
            scanner_data = await self._fetch_scanner_data()
            
            # Compare and validate
            validation_result = await self._compare_scanner_data_with_code(scanner_data)
            
            # Save to database
            record_data = {
                "serial_number": barcode_data.get("serial_number"),
                "part_number": part_number,
                "scanner_data": scanner_data,
                "barcode_data": barcode_data,
                "validation_result": validation_result,
                "timestamp": datetime.now().isoformat(),
                "cycle_count": self.cycle_count
            }
            
            await self._save_to_database(record_data)
            
            return {
                "type": "scan_complete",
                "data": record_data,
                "result": validation_result
            }
            
        except Exception as error:
            logger.error(f"❌ Error in scan cycle: {error}")
            return {
                "type": "error",
                "error": str(error),
                "timestamp": datetime.now().isoformat()
            }
    
    async def _wait_for_scan_trigger(self) -> None:
        """Wait for scan trigger from Modbus"""
        logger.info("⏳ Waiting for scan trigger...")
        
        # Check for scan trigger bit (customize based on your setup)
        scan_register = 1414  # Example register
        scan_bit = 0  # Example bit
        
        while self.is_running:
            try:
                bit_value = await self.modbus_service.read_bit(scan_register, scan_bit)
                if bit_value:
                    logger.info("✅ Scan trigger detected")
                    break
                await asyncio.sleep(0.1)
            except Exception as error:
                logger.error(f"❌ Error checking scan trigger: {error}")
                await asyncio.sleep(1)
    
    async def _fetch_scanner_data(self, options: Optional[Dict] = None) -> str:
        """
        Fetch data from TCP scanner - equivalent to fetchScannerData in Node.js
        """
        logger.info("📱 Fetching scanner data...")
        
        try:
            # Send read command to scanner
            scanner_data = await self.scanner_service.read_data()
            
            if scanner_data:
                logger.success(f"📱 Scanner data received: {scanner_data}")
                await self._write_to_file(self.text_file_path, scanner_data, "Scanner Data")
                return scanner_data.strip()
            else:
                logger.warn("⚠️ No data received from scanner")
                return ""
                
        except Exception as error:
            logger.error(f"❌ Error fetching scanner data: {error}")
            raise
    
    async def _generate_and_write_barcode(self, part_number: str) -> Dict:
        """Generate barcode data and write to file"""
        logger.info(f"🏷️ Generating barcode for part: {part_number}")
        
        try:
            # Generate serial number (customize based on your logic)
            serial_number = await self._generate_serial_number(part_number)
            
            # Create barcode data
            barcode_data = {
                "part_number": part_number,
                "serial_number": serial_number,
                "timestamp": datetime.now().isoformat(),
                "day_id": self.current_day_id
            }
            
            # Write to code file
            code_string = f"{part_number}|{serial_number}"
            await self._write_to_file(self.code_file_path, code_string, "Barcode Data")
            
            logger.success(f"🏷️ Barcode generated: {serial_number}")
            return barcode_data
            
        except Exception as error:
            logger.error(f"❌ Error generating barcode: {error}")
            raise
    
    async def _generate_serial_number(self, part_number: str) -> str:
        """Generate serial number based on part number and current sequence"""
        try:
            # Get current sequence from database
            sequence_doc = await self.database_service.find_one(
                "sequences", 
                {"part_number": part_number}
            )
            
            if sequence_doc:
                next_sequence = sequence_doc["current_sequence"] + 1
                await self.database_service.update_one(
                    "sequences",
                    {"part_number": part_number},
                    {"$set": {"current_sequence": next_sequence}}
                )
            else:
                next_sequence = 1
                await self.database_service.insert_one(
                    "sequences",
                    {"part_number": part_number, "current_sequence": 1}
                )
            
            # Format serial number (customize format as needed)
            date_str = datetime.now().strftime("%y%m%d")
            serial_number = f"{part_number}-{date_str}-{next_sequence:06d}"
            
            return serial_number
            
        except Exception as error:
            logger.error(f"❌ Error generating serial number: {error}")
            raise
    
    async def _compare_scanner_data_with_code(self, scanner_data: str) -> Dict:
        """Compare scanner data with expected code"""
        try:
            # Read expected code from file
            if os.path.exists(self.code_file_path):
                with open(self.code_file_path, 'r') as f:
                    expected_code = f.read().strip()
            else:
                expected_code = ""
            
            # Compare data
            is_match = scanner_data == expected_code
            
            result = {
                "is_match": is_match,
                "expected": expected_code,
                "actual": scanner_data,
                "timestamp": datetime.now().isoformat()
            }
            
            if is_match:
                logger.success("✅ Scanner data matches expected code")
            else:
                logger.warn(f"⚠️ Data mismatch - Expected: {expected_code}, Got: {scanner_data}")
            
            return result
            
        except Exception as error:
            logger.error(f"❌ Error comparing scanner data: {error}")
            raise
    
    async def _save_to_database(self, record_data: Dict) -> None:
        """Save scan record to database"""
        try:
            await self.database_service.insert_one("scan_records", record_data)
            logger.success(f"💾 Record saved to database: {record_data.get('serial_number')}")
        except Exception as error:
            logger.error(f"❌ Error saving to database: {error}")
            raise
    
    async def _start_reset_monitoring(self) -> None:
        """Start concurrent reset monitoring in background task"""
        if self.reset_monitoring_active:
            logger.warn("⚠️ Reset monitoring already active")
            return
            
        self.reset_monitoring_active = True
        self.reset_monitor_task = asyncio.create_task(self._reset_monitor_loop())
        logger.success("🔄 Concurrent reset monitoring started")
    
    async def _stop_reset_monitoring(self) -> None:
        """Stop concurrent reset monitoring"""
        if not self.reset_monitoring_active:
            return
            
        self.reset_monitoring_active = False
        
        if self.reset_monitor_task:
            self.reset_monitor_task.cancel()
            try:
                await self.reset_monitor_task
            except asyncio.CancelledError:
                pass
            self.reset_monitor_task = None
            
        logger.info("🔄 Concurrent reset monitoring stopped")
    
    async def _reset_monitor_loop(self) -> None:
        """
        Concurrent reset monitoring loop - runs independently of scan cycles
        This continuously monitors for reset conditions in the background
        """
        logger.info("🔄 Reset monitor loop started")
        
        # Configuration for reset monitoring
        reset_register = 1415  # Customize based on your Modbus setup
        reset_bit = 0         # Customize based on your Modbus setup
        check_interval = 0.1  # Check every 100ms for responsive reset detection
        
        last_reset_state = False
        consecutive_reset_count = 0
        reset_debounce_threshold = 3  # Require 3 consecutive readings to confirm reset
        
        while self.reset_monitoring_active:
            try:
                # Read reset bit from Modbus
                current_reset_state = await self.modbus_service.read_bit(reset_register, reset_bit)
                
                # Debounce the reset signal to avoid false triggers
                if current_reset_state and not last_reset_state:
                    consecutive_reset_count += 1
                    logger.debug(f"🔄 Reset signal detected ({consecutive_reset_count}/{reset_debounce_threshold})")
                    
                    if consecutive_reset_count >= reset_debounce_threshold:
                        # Confirmed reset condition
                        logger.info("🔄 RESET CONDITION CONFIRMED - Setting reset event")
                        self.reset_event.set()
                        
                        # Notify all reset listeners
                        for listener in self.reset_listeners.copy():
                            try:
                                if asyncio.iscoroutinefunction(listener):
                                    await listener()
                                else:
                                    listener()
                            except Exception as e:
                                logger.error(f"❌ Error in reset listener: {e}")
                        
                        consecutive_reset_count = 0
                        
                elif not current_reset_state:
                    # Reset signal cleared
                    consecutive_reset_count = 0
                
                last_reset_state = current_reset_state
                
                # Short sleep to avoid overwhelming the Modbus connection
                await asyncio.sleep(check_interval)
                
            except asyncio.CancelledError:
                logger.info("🔄 Reset monitor loop cancelled")
                break
            except Exception as error:
                logger.error(f"❌ Error in reset monitor loop: {error}")
                
                # Back off on errors to avoid flooding logs
                await asyncio.sleep(1.0)
                
        logger.info("🔄 Reset monitor loop ended")
    
    def add_reset_listener(self, listener: Callable) -> None:
        """Add a listener for reset events"""
        self.reset_listeners.add(listener)
        logger.debug(f"🔄 Reset listener added - Total listeners: {len(self.reset_listeners)}")
    
    def remove_reset_listener(self, listener: Callable) -> None:
        """Remove a reset listener"""
        self.reset_listeners.discard(listener)
        logger.debug(f"🔄 Reset listener removed - Total listeners: {len(self.reset_listeners)}")
    
    async def _check_reset(self) -> bool:
        """Check if reset condition is met (legacy method for compatibility)"""
        try:
            # Check reset bit in Modbus (customize based on your setup)
            reset_register = 1415
            reset_bit = 0
            
            return await self.modbus_service.read_bit(reset_register, reset_bit)
        except Exception as error:
            logger.error(f"❌ Error checking reset: {error}")
            return False
    
    async def _handle_reset(self) -> None:
        """Handle reset condition"""
        logger.info("🔄 Handling reset condition")
        try:
            await self.reset_bits()
            self.cycle_count = 0
            self.last_reset_date = datetime.now()
            logger.success("🔄 Reset handled successfully")
        except Exception as error:
            logger.error(f"❌ Error handling reset: {error}")
            raise
    
    async def _handle_scan_error(self, error: Exception) -> None:
        """Handle scan errors with appropriate logging and recovery"""
        logger.error(f"❌ Scan error: {error}")
        
        # Attempt to reconnect services if needed
        if "connection" in str(error).lower():
            logger.info("🔄 Attempting to reconnect services...")
            try:
                if self.scanner_service:
                    await self.scanner_service.reconnect()
                if self.modbus_service:
                    await self.modbus_service.reconnect()
                logger.success("🔄 Services reconnected")
            except Exception as reconnect_error:
                logger.error(f"❌ Reconnection failed: {reconnect_error}")
    
    async def _write_to_file(self, file_path: str, data: str, description: str = "Data") -> None:
        """Write data to file with error handling"""
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(data)
            logger.debug(f"📝 {description} written to {file_path}")
        except Exception as error:
            logger.error(f"❌ Error writing {description} to file: {error}")
            raise
    
    def _get_last_reset_time(self) -> datetime:
        """Get the last reset time"""
        # Initialize with current date at midnight
        return datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    def _setup_shutdown_handlers(self) -> None:
        """Setup graceful shutdown handlers"""
        if self.shutdown_handlers_set:
            return
        
        logger.info("🔧 Setting up shutdown handlers")
        
        def signal_handler(signum, frame):
            logger.info(f"🛑 Received signal {signum}, shutting down gracefully...")
            asyncio.create_task(self.cleanup())
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        self.shutdown_handlers_set = True
    
    async def cleanup(self) -> None:
        """Cleanup resources and connections"""
        logger.section("Scanner Controller Cleanup")
        
        try:
            self.is_running = False
            
            # Stop concurrent reset monitoring
            await self._stop_reset_monitoring()
            
            if self.scanner_service:
                await self.scanner_service.disconnect()
                logger.info("📱 Scanner service disconnected")
            
            if self.modbus_service:
                await self.modbus_service.disconnect()
                logger.info("🔌 Modbus service disconnected")
            
            if self.database_service:
                await self.database_service.disconnect()
                logger.info("📦 Database service disconnected")
            
            logger.success("🧹 Cleanup completed successfully")
            
        except Exception as error:
            logger.error(f"❌ Error during cleanup: {error}")
    
    def stop_scanning(self) -> None:
        """Stop the continuous scanning loop"""
        logger.info("🛑 Stopping continuous scan...")
        self.is_running = False
    
    def get_status(self) -> Dict:
        """Get current controller status"""
        return {
            "is_initialized": self.is_initialized,
            "is_running": self.is_running,
            "cycle_count": self.cycle_count,
            "current_day_id": self.current_day_id,
            "last_reset_date": self.last_reset_date.isoformat() if self.last_reset_date else None,
            "services": {
                "scanner": self.scanner_service.is_connected() if self.scanner_service else False,
                "modbus": self.modbus_service.is_connected() if self.modbus_service else False,
                "database": self.database_service.is_connected() if self.database_service else False
            }
        }


# Singleton instance
scanner_controller = ScannerController() 