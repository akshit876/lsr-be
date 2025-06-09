#!/usr/bin/env python3
"""
Setup script for Scanner Desktop Application
"""

import os
import sys
import subprocess
from pathlib import Path

def check_python_version():
    """Check if Python version is compatible"""
    if sys.version_info < (3, 8):
        print("❌ Error: Python 3.8 or higher is required")
        print(f"   Current version: {sys.version}")
        return False
    
    print(f"✅ Python version: {sys.version}")
    return True

def create_virtual_environment():
    """Create a virtual environment"""
    venv_path = Path("venv")
    
    if venv_path.exists():
        print("✅ Virtual environment already exists")
        return True
    
    try:
        print("📦 Creating virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", "venv"], check=True)
        print("✅ Virtual environment created successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to create virtual environment: {e}")
        return False

def get_pip_command():
    """Get the appropriate pip command for the platform"""
    if sys.platform == "win32":
        return str(Path("venv") / "Scripts" / "pip.exe")
    else:
        return str(Path("venv") / "bin" / "pip")

def install_dependencies():
    """Install Python dependencies"""
    pip_cmd = get_pip_command()
    
    if not Path(pip_cmd).exists():
        print("❌ Virtual environment pip not found")
        return False
    
    try:
        print("📦 Installing dependencies...")
        subprocess.run([pip_cmd, "install", "--upgrade", "pip"], check=True)
        subprocess.run([pip_cmd, "install", "-r", "requirements.txt"], check=True)
        print("✅ Dependencies installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        return False

def create_config_file():
    """Create default configuration file"""
    config_path = Path("config.json")
    
    if config_path.exists():
        print("✅ Configuration file already exists")
        return True
    
    default_config = {
        "scanner": {
            "host": "192.168.1.100",
            "port": 4001,
            "timeout": 10,
            "reconnect_interval": 5
        },
        "modbus": {
            "host": "192.168.3.146",
            "port": 502,
            "slave_id": 1,
            "timeout": 5
        },
        "database": {
            "connection_string": "mongodb://localhost:27017",
            "database_name": "main-data",
            "collection_name": "records"
        },
        "ui": {
            "theme": "light",
            "language": "en",
            "auto_refresh_interval": 5000,
            "show_system_tray": True,
            "minimize_to_tray": True
        },
        "logging": {
            "level": "INFO",
            "log_file": "scanner_app.log",
            "max_file_size": 10485760,
            "backup_count": 5
        }
    }
    
    try:
        import json
        with open(config_path, 'w') as f:
            json.dump(default_config, f, indent=2)
        
        print("✅ Default configuration file created")
        print(f"   Please edit {config_path} with your settings")
        return True
    except Exception as e:
        print(f"❌ Failed to create configuration file: {e}")
        return False

def create_directories():
    """Create necessary directories"""
    directories = [
        "logs",
        "data",
        "assets/icons",
        "assets/styles"
    ]
    
    for directory in directories:
        dir_path = Path(directory)
        dir_path.mkdir(parents=True, exist_ok=True)
        print(f"✅ Created directory: {directory}")
    
    return True

def create_startup_scripts():
    """Create startup scripts for different platforms"""
    
    # Windows batch file
    windows_script = Path("start_scanner.bat")
    with open(windows_script, 'w') as f:
        f.write("""@echo off
echo Starting Scanner Desktop Application...
cd /d "%~dp0"
venv\\Scripts\\python.exe main.py
pause
""")
    
    # Linux/Mac shell script
    unix_script = Path("start_scanner.sh")
    with open(unix_script, 'w') as f:
        f.write("""#!/bin/bash
echo "Starting Scanner Desktop Application..."
cd "$(dirname "$0")"
source venv/bin/activate
python main.py
""")
    
    # Make shell script executable on Unix systems
    if sys.platform != "win32":
        os.chmod(unix_script, 0o755)
    
    print("✅ Startup scripts created")
    return True

def create_desktop_shortcut():
    """Create desktop shortcut (Windows only)"""
    if sys.platform != "win32":
        return True
    
    try:
        import winshell
        from win32com.client import Dispatch
        
        desktop = winshell.desktop()
        shortcut_path = os.path.join(desktop, "Scanner Control System.lnk")
        
        shell = Dispatch('WScript.Shell')
        shortcut = shell.CreateShortCut(shortcut_path)
        shortcut.Targetpath = str(Path.cwd() / "start_scanner.bat")
        shortcut.WorkingDirectory = str(Path.cwd())
        shortcut.IconLocation = str(Path.cwd() / "assets" / "icons" / "scanner_icon.ico")
        shortcut.save()
        
        print("✅ Desktop shortcut created")
        return True
    except ImportError:
        print("⚠️ Desktop shortcut creation requires winshell and pywin32")
        print("   Install with: pip install winshell pywin32")
        return True
    except Exception as e:
        print(f"⚠️ Failed to create desktop shortcut: {e}")
        return True

def run_tests():
    """Run basic tests to verify installation"""
    try:
        print("🧪 Running basic tests...")
        
        # Test imports
        sys.path.insert(0, str(Path.cwd()))
        
        from utils.config import Config
        from utils.logger import get_logger
        
        # Test configuration
        config = Config("config.json")
        assert config.validate_config(), "Configuration validation failed"
        
        # Test logger
        logger = get_logger("test")
        logger.info("Test log message")
        
        print("✅ Basic tests passed")
        return True
        
    except Exception as e:
        print(f"❌ Tests failed: {e}")
        return False

def main():
    """Main setup function"""
    print("🚀 Scanner Desktop Application Setup")
    print("=" * 50)
    
    # Check Python version
    if not check_python_version():
        return False
    
    # Create virtual environment
    if not create_virtual_environment():
        return False
    
    # Install dependencies
    if not install_dependencies():
        return False
    
    # Create configuration file
    if not create_config_file():
        return False
    
    # Create directories
    if not create_directories():
        return False
    
    # Create startup scripts
    if not create_startup_scripts():
        return False
    
    # Create desktop shortcut (Windows only)
    create_desktop_shortcut()
    
    # Run tests
    if not run_tests():
        print("⚠️ Some tests failed, but installation may still work")
    
    print("\n🎉 Setup completed successfully!")
    print("\nNext steps:")
    print("1. Edit config.json with your scanner and PLC settings")
    print("2. Ensure MongoDB is running")
    print("3. Configure your scanner for TCP mode")
    print("4. Run the application:")
    
    if sys.platform == "win32":
        print("   - Double-click start_scanner.bat")
        print("   - Or run: python main.py")
    else:
        print("   - Run: ./start_scanner.sh")
        print("   - Or run: source venv/bin/activate && python main.py")
    
    print("\nFor troubleshooting, see README.md")
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 