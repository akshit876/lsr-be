"""
Logging utility for the Scanner Desktop Application
"""

import logging
import logging.handlers
from pathlib import Path
from typing import Optional


def setup_logger(name: str, 
                log_file: Optional[str] = None, 
                level: str = "INFO",
                max_bytes: int = 10 * 1024 * 1024,  # 10MB
                backup_count: int = 5) -> logging.Logger:
    """
    Set up a logger with file and console handlers
    
    Args:
        name: Logger name
        log_file: Log file path (optional)
        level: Logging level
        max_bytes: Maximum file size before rotation
        backup_count: Number of backup files to keep
        
    Returns:
        Configured logger instance
    """
    
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper()))
    
    # Remove existing handlers to avoid duplicates
    logger.handlers.clear()
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # File handler (if log file specified)
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        file_handler = logging.handlers.RotatingFileHandler(
            log_path, 
            maxBytes=max_bytes, 
            backupCount=backup_count
        )
        file_handler.setLevel(getattr(logging, level.upper()))
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger


class ScannerLogger:
    """Enhanced logger with section support for scanner operations"""
    
    def __init__(self, name: str, log_file: Optional[str] = None):
        self.logger = setup_logger(name, log_file)
        self.current_section = None
    
    def section(self, title: str):
        """Log a section header"""
        separator = "=" * 60
        self.logger.info(f"\n{separator}")
        self.logger.info(f"📍 {title}")
        self.logger.info(separator)
        self.current_section = title
    
    def subsection(self, title: str):
        """Log a subsection header"""
        separator = "-" * 40
        self.logger.info(f"\n{separator}")
        self.logger.info(f"🔹 {title}")
        self.logger.info(separator)
    
    def success(self, message: str):
        """Log a success message"""
        self.logger.info(f"✅ {message}")
    
    def error(self, message: str, exc_info: bool = False):
        """Log an error message"""
        self.logger.error(f"❌ {message}", exc_info=exc_info)
    
    def warning(self, message: str):
        """Log a warning message"""
        self.logger.warning(f"⚠️ {message}")
    
    def info(self, message: str):
        """Log an info message"""
        self.logger.info(f"ℹ️ {message}")
    
    def debug(self, message: str):
        """Log a debug message"""
        self.logger.debug(f"🐛 {message}")
    
    def operation_start(self, operation: str):
        """Log the start of an operation"""
        self.logger.info(f"🚀 Starting: {operation}")
    
    def operation_complete(self, operation: str):
        """Log the completion of an operation"""
        self.logger.info(f"🎉 Completed: {operation}")
    
    def scanner_data(self, data: str, scanner_type: str = "Scanner"):
        """Log scanner data received"""
        self.logger.info(f"📥 {scanner_type} Data: {data}")
    
    def modbus_operation(self, operation: str, register: int, value=None):
        """Log Modbus operations"""
        if value is not None:
            self.logger.info(f"📡 Modbus {operation}: Register {register} = {value}")
        else:
            self.logger.info(f"📡 Modbus {operation}: Register {register}")
    
    def database_operation(self, operation: str, details: str = ""):
        """Log database operations"""
        if details:
            self.logger.info(f"💾 Database {operation}: {details}")
        else:
            self.logger.info(f"💾 Database {operation}")
    
    def connection_status(self, service: str, status: str, details: str = ""):
        """Log connection status"""
        status_icon = "🟢" if status.lower() == "connected" else "🔴"
        message = f"{status_icon} {service}: {status}"
        if details:
            message += f" - {details}"
        self.logger.info(message)
    
    def performance_metric(self, metric: str, value: float, unit: str = ""):
        """Log performance metrics"""
        self.logger.info(f"📊 {metric}: {value:.2f} {unit}")
    
    def separator(self):
        """Log a separator line"""
        self.logger.info("-" * 60)


def get_logger(name: str) -> ScannerLogger:
    """Get a ScannerLogger instance"""
    return ScannerLogger(name)


# Module-level logger
default_logger = get_logger(__name__) 