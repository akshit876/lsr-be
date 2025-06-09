"""
Configuration management for the Scanner Desktop Application
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict
from dotenv import load_dotenv

@dataclass
class ScannerConfig:
    """Scanner connection configuration"""
    host: str = "192.168.1.100"
    port: int = 4001
    timeout: int = 10
    reconnect_interval: int = 5
    
@dataclass
class ModbusConfig:
    """Modbus connection configuration"""
    host: str = "192.168.3.146"
    port: int = 502
    slave_id: int = 1
    timeout: int = 5
    
@dataclass
class DatabaseConfig:
    """Database connection configuration"""
    connection_string: str = "mongodb://localhost:27017"
    database_name: str = "main-data"
    collection_name: str = "records"
    
@dataclass
class UIConfig:
    """UI configuration"""
    theme: str = "light"
    language: str = "en"
    auto_refresh_interval: int = 5000
    show_system_tray: bool = True
    minimize_to_tray: bool = True
    
@dataclass
class LoggingConfig:
    """Logging configuration"""
    level: str = "INFO"
    log_file: str = "scanner_app.log"
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    backup_count: int = 5

class Config:
    """Main configuration class"""
    
    def __init__(self, config_file: Optional[str] = None):
        self.config_file = config_file or "config.json"
        self.config_path = Path(self.config_file)
        
        # Load environment variables
        load_dotenv()
        
        # Initialize configurations
        self.scanner = ScannerConfig()
        self.modbus = ModbusConfig()
        self.database = DatabaseConfig()
        self.ui = UIConfig()
        self.logging = LoggingConfig()
        
        # Load configuration
        self.load_config()
        self.load_env_overrides()
    
    def load_config(self):
        """Load configuration from JSON file"""
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    config_data = json.load(f)
                
                # Update configurations
                if 'scanner' in config_data:
                    self.scanner = ScannerConfig(**config_data['scanner'])
                
                if 'modbus' in config_data:
                    self.modbus = ModbusConfig(**config_data['modbus'])
                
                if 'database' in config_data:
                    self.database = DatabaseConfig(**config_data['database'])
                
                if 'ui' in config_data:
                    self.ui = UIConfig(**config_data['ui'])
                
                if 'logging' in config_data:
                    self.logging = LoggingConfig(**config_data['logging'])
                
            except Exception as e:
                print(f"Error loading config file: {e}")
    
    def load_env_overrides(self):
        """Load configuration overrides from environment variables"""
        # Scanner configuration
        if os.getenv('SCANNER_HOST'):
            self.scanner.host = os.getenv('SCANNER_HOST')
        if os.getenv('SCANNER_PORT'):
            self.scanner.port = int(os.getenv('SCANNER_PORT'))
        if os.getenv('SCANNER_TIMEOUT'):
            self.scanner.timeout = int(os.getenv('SCANNER_TIMEOUT'))
        
        # Modbus configuration
        if os.getenv('MODBUS_HOST'):
            self.modbus.host = os.getenv('MODBUS_HOST')
        if os.getenv('MODBUS_PORT'):
            self.modbus.port = int(os.getenv('MODBUS_PORT'))
        if os.getenv('MODBUS_SLAVE_ID'):
            self.modbus.slave_id = int(os.getenv('MODBUS_SLAVE_ID'))
        
        # Database configuration
        if os.getenv('MONGODB_URI'):
            self.database.connection_string = os.getenv('MONGODB_URI')
        if os.getenv('DATABASE_NAME'):
            self.database.database_name = os.getenv('DATABASE_NAME')
        if os.getenv('COLLECTION_NAME'):
            self.database.collection_name = os.getenv('COLLECTION_NAME')
        
        # UI configuration
        if os.getenv('UI_THEME'):
            self.ui.theme = os.getenv('UI_THEME')
        if os.getenv('UI_LANGUAGE'):
            self.ui.language = os.getenv('UI_LANGUAGE')
        
        # Logging configuration
        if os.getenv('LOG_LEVEL'):
            self.logging.level = os.getenv('LOG_LEVEL')
        if os.getenv('LOG_FILE'):
            self.logging.log_file = os.getenv('LOG_FILE')
    
    def save_config(self):
        """Save current configuration to JSON file"""
        try:
            config_data = {
                'scanner': asdict(self.scanner),
                'modbus': asdict(self.modbus),
                'database': asdict(self.database),
                'ui': asdict(self.ui),
                'logging': asdict(self.logging)
            }
            
            with open(self.config_path, 'w') as f:
                json.dump(config_data, f, indent=2)
                
        except Exception as e:
            print(f"Error saving config file: {e}")
    
    def get_scanner_config(self) -> Dict[str, Any]:
        """Get scanner configuration as dictionary"""
        return asdict(self.scanner)
    
    def get_modbus_config(self) -> Dict[str, Any]:
        """Get Modbus configuration as dictionary"""
        return asdict(self.modbus)
    
    def get_database_config(self) -> Dict[str, Any]:
        """Get database configuration as dictionary"""
        return asdict(self.database)
    
    def get_ui_config(self) -> Dict[str, Any]:
        """Get UI configuration as dictionary"""
        return asdict(self.ui)
    
    def get_logging_config(self) -> Dict[str, Any]:
        """Get logging configuration as dictionary"""
        return asdict(self.logging)
    
    def update_scanner_config(self, **kwargs):
        """Update scanner configuration"""
        for key, value in kwargs.items():
            if hasattr(self.scanner, key):
                setattr(self.scanner, key, value)
    
    def update_modbus_config(self, **kwargs):
        """Update Modbus configuration"""
        for key, value in kwargs.items():
            if hasattr(self.modbus, key):
                setattr(self.modbus, key, value)
    
    def update_database_config(self, **kwargs):
        """Update database configuration"""
        for key, value in kwargs.items():
            if hasattr(self.database, key):
                setattr(self.database, key, value)
    
    def update_ui_config(self, **kwargs):
        """Update UI configuration"""
        for key, value in kwargs.items():
            if hasattr(self.ui, key):
                setattr(self.ui, key, value)
    
    def update_logging_config(self, **kwargs):
        """Update logging configuration"""
        for key, value in kwargs.items():
            if hasattr(self.logging, key):
                setattr(self.logging, key, value)
    
    def validate_config(self) -> bool:
        """Validate configuration values"""
        try:
            # Validate scanner config
            assert 1 <= self.scanner.port <= 65535, "Scanner port must be between 1-65535"
            assert self.scanner.timeout > 0, "Scanner timeout must be positive"
            
            # Validate Modbus config
            assert 1 <= self.modbus.port <= 65535, "Modbus port must be between 1-65535"
            assert 1 <= self.modbus.slave_id <= 255, "Modbus slave ID must be between 1-255"
            
            # Validate UI config
            assert self.ui.theme in ['light', 'dark'], "UI theme must be 'light' or 'dark'"
            assert self.ui.auto_refresh_interval > 0, "Auto refresh interval must be positive"
            
            # Validate logging config
            assert self.logging.level in ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'], \
                "Log level must be valid logging level"
            
            return True
            
        except AssertionError as e:
            print(f"Configuration validation error: {e}")
            return False
    
    def reset_to_defaults(self):
        """Reset configuration to default values"""
        self.scanner = ScannerConfig()
        self.modbus = ModbusConfig()
        self.database = DatabaseConfig()
        self.ui = UIConfig()
        self.logging = LoggingConfig()
    
    def __str__(self) -> str:
        """String representation of configuration"""
        return f"""
Scanner Configuration:
  Host: {self.scanner.host}
  Port: {self.scanner.port}
  Timeout: {self.scanner.timeout}s

Modbus Configuration:
  Host: {self.modbus.host}
  Port: {self.modbus.port}
  Slave ID: {self.modbus.slave_id}

Database Configuration:
  Connection: {self.database.connection_string}
  Database: {self.database.database_name}
  Collection: {self.database.collection_name}

UI Configuration:
  Theme: {self.ui.theme}
  Language: {self.ui.language}
  Auto Refresh: {self.ui.auto_refresh_interval}ms

Logging Configuration:
  Level: {self.logging.level}
  File: {self.logging.log_file}
        """.strip() 