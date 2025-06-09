#!/usr/bin/env python3
"""
Scanner Desktop Application
Main entry point for the Python desktop scanner system
"""

import sys
import os
import logging
from pathlib import Path
from PyQt5.QtWidgets import QApplication, QMainWindow, QSystemTrayIcon, QMenu, QAction
from PyQt5.QtCore import QTimer, pyqtSignal, QObject, QThread
from PyQt5.QtGui import QIcon, QPixmap
from dotenv import load_dotenv

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from ui.main_window import MainWindow
from services.scanner_controller import scanner_controller
from utils.logger import setup_logger
from utils.config import Config

class ScannerApp(QMainWindow):
    """Main Scanner Application Class"""
    
    def __init__(self):
        super().__init__()
        self.logger = setup_logger(__name__)
        self.config = Config()
        
        # Initialize main controller
        self.scanner_controller = scanner_controller
        
        # Initialize UI
        self.main_window = None
        self.system_tray = None
        
        self.init_services()
        self.init_ui()
        self.init_system_tray()
        
    def init_services(self):
        """Initialize the scanner controller"""
        try:
            self.logger.info("Initializing scanner controller...")
            
            # Initialize the main scanner controller asynchronously
            import asyncio
            
            # Run initialization in async context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self.scanner_controller.initialize())
            
            self.logger.info("Scanner controller initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize scanner controller: {e}")
            raise
    
    def init_ui(self):
        """Initialize the main user interface"""
        try:
            self.main_window = MainWindow(
                scanner_controller=self.scanner_controller,
                config=self.config
            )
            
            # Set main window properties
            self.setCentralWidget(self.main_window)
            self.setWindowTitle("Scanner Control System")
            self.setMinimumSize(1200, 800)
            self.resize(1400, 900)
            
            # Center the window
            self.center_window()
            
        except Exception as e:
            self.logger.error(f"Failed to initialize UI: {e}")
            raise
    
    def init_system_tray(self):
        """Initialize system tray icon"""
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.system_tray = QSystemTrayIcon(self)
            
            # Create tray icon
            icon_path = project_root / "assets" / "scanner_icon.png"
            if icon_path.exists():
                self.system_tray.setIcon(QIcon(str(icon_path)))
            else:
                # Create a simple default icon
                pixmap = QPixmap(16, 16)
                pixmap.fill()
                self.system_tray.setIcon(QIcon(pixmap))
            
            # Create tray menu
            tray_menu = QMenu()
            
            show_action = QAction("Show", self)
            show_action.triggered.connect(self.show_window)
            tray_menu.addAction(show_action)
            
            hide_action = QAction("Hide", self)
            hide_action.triggered.connect(self.hide)
            tray_menu.addAction(hide_action)
            
            tray_menu.addSeparator()
            
            quit_action = QAction("Quit", self)
            quit_action.triggered.connect(self.quit_application)
            tray_menu.addAction(quit_action)
            
            self.system_tray.setContextMenu(tray_menu)
            self.system_tray.show()
            
            # Handle tray icon activation
            self.system_tray.activated.connect(self.tray_icon_activated)
    
    def center_window(self):
        """Center the window on the screen"""
        frame_geometry = self.frameGeometry()
        screen = QApplication.desktop().screenNumber(QApplication.desktop().cursor().pos())
        center_point = QApplication.desktop().screenGeometry(screen).center()
        frame_geometry.moveCenter(center_point)
        self.move(frame_geometry.topLeft())
    
    def show_window(self):
        """Show and bring window to front"""
        self.show()
        self.raise_()
        self.activateWindow()
    
    def tray_icon_activated(self, reason):
        """Handle system tray icon activation"""
        if reason == QSystemTrayIcon.DoubleClick:
            self.show_window()
    
    def closeEvent(self, event):
        """Handle window close event"""
        if self.system_tray and self.system_tray.isVisible():
            self.hide()
            event.ignore()
        else:
            self.quit_application()
    
    def quit_application(self):
        """Quit the application properly"""
        try:
            self.logger.info("Shutting down application...")
            
            # Stop scanner controller
            if self.scanner_controller:
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(self.scanner_controller.cleanup())
            
            # Hide system tray
            if self.system_tray:
                self.system_tray.hide()
            
            QApplication.quit()
            
        except Exception as e:
            self.logger.error(f"Error during shutdown: {e}")
            QApplication.quit()


def main():
    """Main application entry point"""
    # Load environment variables
    load_dotenv()
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('scanner_app.log'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Create QApplication
    app = QApplication(sys.argv)
    app.setApplicationName("Scanner Control System")
    app.setApplicationVersion("1.0.0")
    app.setOrganizationName("Manufacturing Solutions")
    
    # Enable high DPI scaling
    app.setAttribute(app.AA_EnableHighDpiScaling, True)
    
    try:
        # Create and show main application
        scanner_app = ScannerApp()
        scanner_app.show()
        
        # Start event loop
        sys.exit(app.exec_())
        
    except Exception as e:
        logging.error(f"Failed to start application: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main() 