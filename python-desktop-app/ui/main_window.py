"""
Main Window UI for Scanner Application
"""

import asyncio
from PyQt5.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QPushButton, 
                             QLabel, QTextEdit, QGroupBox, QGridLayout, 
                             QLineEdit, QComboBox, QProgressBar, QFrame,
                             QScrollArea, QSplitter, QTabWidget, QTableWidget,
                             QTableWidgetItem, QHeaderView)
from PyQt5.QtCore import QTimer, pyqtSignal, QThread, QObject
from PyQt5.QtGui import QFont, QColor, QPalette
from utils.logger import logger


class ScanWorker(QObject):
    """Worker thread for running scan operations"""
    
    scan_result = pyqtSignal(dict)
    error_occurred = pyqtSignal(str)
    
    def __init__(self, scanner_controller, part_number):
        super().__init__()
        self.scanner_controller = scanner_controller
        self.part_number = part_number
        self.is_running = False
    
    def start_scanning(self):
        """Start the scanning process"""
        self.is_running = True
        try:
            # Create new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # Run the continuous scan
            loop.run_until_complete(
                self.scanner_controller.run_continuous_scan(
                    self.part_number, 
                    self.scan_callback
                )
            )
        except Exception as e:
            self.error_occurred.emit(str(e))
    
    async def scan_callback(self, result):
        """Callback for scan results"""
        if self.is_running:
            self.scan_result.emit(result)
    
    def stop_scanning(self):
        """Stop the scanning process"""
        self.is_running = False
        if self.scanner_controller:
            self.scanner_controller.stop_scanning()


class MainWindow(QWidget):
    """Main application window"""
    
    def __init__(self, scanner_controller, config):
        super().__init__()
        self.scanner_controller = scanner_controller
        self.config = config
        
        # Initialize worker thread
        self.scan_worker = None
        self.scan_thread = None
        
        # Status tracking
        self.is_scanning = False
        
        self.init_ui()
        self.setup_timers()
        self.update_status()
    
    def init_ui(self):
        """Initialize the user interface"""
        self.setWindowTitle("Scanner Control System")
        
        # Main layout
        main_layout = QHBoxLayout()
        
        # Create splitter for resizable panels
        splitter = QSplitter()
        
        # Left panel - Controls
        left_panel = self.create_control_panel()
        splitter.addWidget(left_panel)
        
        # Right panel - Data display
        right_panel = self.create_data_panel()
        splitter.addWidget(right_panel)
        
        # Set splitter proportions
        splitter.setSizes([400, 800])
        
        main_layout.addWidget(splitter)
        self.setLayout(main_layout)
        
        # Apply styling
        self.apply_styles()
    
    def create_control_panel(self):
        """Create the left control panel"""
        panel = QFrame()
        panel.setFrameStyle(QFrame.StyledPanel)
        layout = QVBoxLayout()
        
        # System Status Group
        status_group = QGroupBox("System Status")
        status_layout = QGridLayout()
        
        # Status indicators
        self.scanner_status = QLabel("⚫ Disconnected")
        self.modbus_status = QLabel("⚫ Disconnected") 
        self.database_status = QLabel("⚫ Disconnected")
        
        status_layout.addWidget(QLabel("Scanner:"), 0, 0)
        status_layout.addWidget(self.scanner_status, 0, 1)
        status_layout.addWidget(QLabel("Modbus:"), 1, 0)
        status_layout.addWidget(self.modbus_status, 1, 1)
        status_layout.addWidget(QLabel("Database:"), 2, 0)
        status_layout.addWidget(self.database_status, 2, 1)
        
        status_group.setLayout(status_layout)
        layout.addWidget(status_group)
        
        # Scan Control Group
        control_group = QGroupBox("Scan Control")
        control_layout = QVBoxLayout()
        
        # Part number input
        part_layout = QHBoxLayout()
        part_layout.addWidget(QLabel("Part Number:"))
        self.part_number_input = QLineEdit()
        self.part_number_input.setText("PART001")  # Default value
        part_layout.addWidget(self.part_number_input)
        control_layout.addLayout(part_layout)
        
        # Control buttons
        button_layout = QHBoxLayout()
        
        self.start_button = QPushButton("Start Scanning")
        self.start_button.clicked.connect(self.start_scanning)
        self.start_button.setStyleSheet("QPushButton { background-color: #4CAF50; color: white; font-weight: bold; }")
        
        self.stop_button = QPushButton("Stop Scanning")
        self.stop_button.clicked.connect(self.stop_scanning)
        self.stop_button.setEnabled(False)
        self.stop_button.setStyleSheet("QPushButton { background-color: #f44336; color: white; font-weight: bold; }")
        
        button_layout.addWidget(self.start_button)
        button_layout.addWidget(self.stop_button)
        control_layout.addLayout(button_layout)
        
        # Progress indicator
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        control_layout.addWidget(self.progress_bar)
        
        control_group.setLayout(control_layout)
        layout.addWidget(control_group)
        
        # Statistics Group
        stats_group = QGroupBox("Statistics")
        stats_layout = QGridLayout()
        
        self.cycle_count_label = QLabel("0")
        self.success_count_label = QLabel("0")
        self.error_count_label = QLabel("0")
        
        stats_layout.addWidget(QLabel("Scan Cycles:"), 0, 0)
        stats_layout.addWidget(self.cycle_count_label, 0, 1)
        stats_layout.addWidget(QLabel("Successful:"), 1, 0)
        stats_layout.addWidget(self.success_count_label, 1, 1)
        stats_layout.addWidget(QLabel("Errors:"), 2, 0)
        stats_layout.addWidget(self.error_count_label, 2, 1)
        
        stats_group.setLayout(stats_layout)
        layout.addWidget(stats_group)
        
        # Stretch to push everything to top
        layout.addStretch()
        
        panel.setLayout(layout)
        return panel
    
    def create_data_panel(self):
        """Create the right data display panel"""
        panel = QFrame()
        panel.setFrameStyle(QFrame.StyledPanel)
        layout = QVBoxLayout()
        
        # Create tab widget
        tab_widget = QTabWidget()
        
        # Scan Results Tab
        results_tab = self.create_results_tab()
        tab_widget.addTab(results_tab, "Scan Results")
        
        # Log Tab
        log_tab = self.create_log_tab()
        tab_widget.addTab(log_tab, "System Log")
        
        # Database Tab
        db_tab = self.create_database_tab()
        tab_widget.addTab(db_tab, "Database Records")
        
        layout.addWidget(tab_widget)
        panel.setLayout(layout)
        return panel
    
    def create_results_tab(self):
        """Create the scan results tab"""
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Current scan info
        current_group = QGroupBox("Current Scan")
        current_layout = QGridLayout()
        
        self.current_serial_label = QLabel("N/A")
        self.current_scanner_data_label = QLabel("N/A")
        self.current_validation_label = QLabel("N/A")
        
        current_layout.addWidget(QLabel("Serial Number:"), 0, 0)
        current_layout.addWidget(self.current_serial_label, 0, 1)
        current_layout.addWidget(QLabel("Scanner Data:"), 1, 0)
        current_layout.addWidget(self.current_scanner_data_label, 1, 1)
        current_layout.addWidget(QLabel("Validation:"), 2, 0)
        current_layout.addWidget(self.current_validation_label, 2, 1)
        
        current_group.setLayout(current_layout)
        layout.addWidget(current_group)
        
        # Recent results table
        recent_group = QGroupBox("Recent Results")
        recent_layout = QVBoxLayout()
        
        self.results_table = QTableWidget()
        self.results_table.setColumnCount(5)
        self.results_table.setHorizontalHeaderLabels([
            "Time", "Serial Number", "Scanner Data", "Validation", "Status"
        ])
        
        # Set table properties
        header = self.results_table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeToContents)
        
        recent_layout.addWidget(self.results_table)
        recent_group.setLayout(recent_layout)
        layout.addWidget(recent_group)
        
        widget.setLayout(layout)
        return widget
    
    def create_log_tab(self):
        """Create the system log tab"""
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Log display
        self.log_display = QTextEdit()
        self.log_display.setReadOnly(True)
        self.log_display.setFont(QFont("Courier", 9))
        
        # Clear button
        clear_button = QPushButton("Clear Log")
        clear_button.clicked.connect(self.log_display.clear)
        
        layout.addWidget(self.log_display)
        layout.addWidget(clear_button)
        
        widget.setLayout(layout)
        return widget
    
    def create_database_tab(self):
        """Create the database records tab"""
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Database table
        self.db_table = QTableWidget()
        self.db_table.setColumnCount(6)
        self.db_table.setHorizontalHeaderLabels([
            "Timestamp", "Part Number", "Serial Number", "Scanner Data", "Validation", "Cycle"
        ])
        
        # Set table properties
        header = self.db_table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeToContents)
        
        # Refresh button
        refresh_button = QPushButton("Refresh Data")
        refresh_button.clicked.connect(self.refresh_database_data)
        
        layout.addWidget(refresh_button)
        layout.addWidget(self.db_table)
        
        widget.setLayout(layout)
        return widget
    
    def apply_styles(self):
        """Apply custom styles to the UI"""
        self.setStyleSheet("""
            QGroupBox {
                font-weight: bold;
                border: 2px solid #cccccc;
                border-radius: 5px;
                margin: 3px;
                padding-top: 10px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px 0 5px;
            }
            QPushButton {
                padding: 8px;
                border-radius: 4px;
                font-weight: bold;
            }
            QLineEdit {
                padding: 5px;
                border: 1px solid #cccccc;
                border-radius: 3px;
            }
            QLabel {
                padding: 2px;
            }
        """)
    
    def setup_timers(self):
        """Setup periodic timers"""
        # Status update timer
        self.status_timer = QTimer()
        self.status_timer.timeout.connect(self.update_status)
        self.status_timer.start(1000)  # Update every second
        
        # Log update timer
        self.log_timer = QTimer()
        self.log_timer.timeout.connect(self.update_log)
        self.log_timer.start(500)  # Update every 0.5 seconds
    
    def start_scanning(self):
        """Start the scanning process"""
        if self.is_scanning:
            return
        
        part_number = self.part_number_input.text().strip()
        if not part_number:
            self.log_message("ERROR: Part number is required")
            return
        
        try:
            # Create worker thread
            self.scan_worker = ScanWorker(self.scanner_controller, part_number)
            self.scan_thread = QThread()
            
            # Move worker to thread
            self.scan_worker.moveToThread(self.scan_thread)
            
            # Connect signals
            self.scan_thread.started.connect(self.scan_worker.start_scanning)
            self.scan_worker.scan_result.connect(self.handle_scan_result)
            self.scan_worker.error_occurred.connect(self.handle_scan_error)
            
            # Start thread
            self.scan_thread.start()
            
            # Update UI
            self.is_scanning = True
            self.start_button.setEnabled(False)
            self.stop_button.setEnabled(True)
            self.progress_bar.setVisible(True)
            self.progress_bar.setRange(0, 0)  # Indeterminate progress
            
            self.log_message(f"INFO: Started scanning for part number: {part_number}")
            
        except Exception as e:
            self.log_message(f"ERROR: Failed to start scanning: {e}")
    
    def stop_scanning(self):
        """Stop the scanning process"""
        if not self.is_scanning:
            return
        
        try:
            # Stop worker
            if self.scan_worker:
                self.scan_worker.stop_scanning()
            
            # Stop thread
            if self.scan_thread:
                self.scan_thread.quit()
                self.scan_thread.wait()
            
            # Update UI
            self.is_scanning = False
            self.start_button.setEnabled(True)
            self.stop_button.setEnabled(False)
            self.progress_bar.setVisible(False)
            
            self.log_message("INFO: Scanning stopped")
            
        except Exception as e:
            self.log_message(f"ERROR: Failed to stop scanning: {e}")
    
    def handle_scan_result(self, result):
        """Handle scan result from worker"""
        try:
            if result.get("type") == "scan_complete":
                data = result.get("data", {})
                
                # Update current scan display
                self.current_serial_label.setText(data.get("serial_number", "N/A"))
                self.current_scanner_data_label.setText(data.get("scanner_data", "N/A"))
                
                validation = data.get("validation_result", {})
                if validation.get("is_match"):
                    self.current_validation_label.setText("✅ PASS")
                    self.current_validation_label.setStyleSheet("color: green; font-weight: bold;")
                else:
                    self.current_validation_label.setText("❌ FAIL")
                    self.current_validation_label.setStyleSheet("color: red; font-weight: bold;")
                
                # Add to results table
                self.add_result_to_table(data)
                
                self.log_message(f"INFO: Scan completed - {data.get('serial_number')}")
                
            elif result.get("type") == "error":
                self.log_message(f"ERROR: {result.get('error')}")
                
            elif result.get("type") == "reset":
                self.log_message("INFO: System reset detected")
                
        except Exception as e:
            self.log_message(f"ERROR: Failed to handle scan result: {e}")
    
    def handle_scan_error(self, error_msg):
        """Handle scan error from worker"""
        self.log_message(f"ERROR: {error_msg}")
        self.stop_scanning()
    
    def add_result_to_table(self, data):
        """Add scan result to the results table"""
        try:
            row = self.results_table.rowCount()
            self.results_table.insertRow(row)
            
            # Add data to table
            timestamp = data.get("timestamp", "")[:19]  # Remove milliseconds
            self.results_table.setItem(row, 0, QTableWidgetItem(timestamp))
            self.results_table.setItem(row, 1, QTableWidgetItem(str(data.get("serial_number", ""))))
            self.results_table.setItem(row, 2, QTableWidgetItem(str(data.get("scanner_data", ""))))
            
            validation = data.get("validation_result", {})
            validation_text = "PASS" if validation.get("is_match") else "FAIL"
            self.results_table.setItem(row, 3, QTableWidgetItem(validation_text))
            self.results_table.setItem(row, 4, QTableWidgetItem("Complete"))
            
            # Scroll to bottom
            self.results_table.scrollToBottom()
            
            # Limit table size (keep last 100 rows)
            if self.results_table.rowCount() > 100:
                self.results_table.removeRow(0)
                
        except Exception as e:
            self.log_message(f"ERROR: Failed to add result to table: {e}")
    
    def update_status(self):
        """Update system status indicators"""
        try:
            if self.scanner_controller:
                status = self.scanner_controller.get_status()
                
                # Update service status indicators
                services = status.get("services", {})
                
                if services.get("scanner"):
                    self.scanner_status.setText("🟢 Connected")
                    self.scanner_status.setStyleSheet("color: green; font-weight: bold;")
                else:
                    self.scanner_status.setText("🔴 Disconnected")
                    self.scanner_status.setStyleSheet("color: red; font-weight: bold;")
                
                if services.get("modbus"):
                    self.modbus_status.setText("🟢 Connected")
                    self.modbus_status.setStyleSheet("color: green; font-weight: bold;")
                else:
                    self.modbus_status.setText("🔴 Disconnected")
                    self.modbus_status.setStyleSheet("color: red; font-weight: bold;")
                
                if services.get("database"):
                    self.database_status.setText("🟢 Connected")
                    self.database_status.setStyleSheet("color: green; font-weight: bold;")
                else:
                    self.database_status.setText("🔴 Disconnected")
                    self.database_status.setStyleSheet("color: red; font-weight: bold;")
                
                # Update statistics
                self.cycle_count_label.setText(str(status.get("cycle_count", 0)))
                
        except Exception as e:
            logger.error(f"Failed to update status: {e}")
    
    def update_log(self):
        """Update log display"""
        # This is a placeholder - in a real implementation, you'd read from log files
        # or maintain a log buffer
        pass
    
    def log_message(self, message):
        """Add message to log display"""
        try:
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M:%S")
            formatted_message = f"[{timestamp}] {message}"
            
            self.log_display.append(formatted_message)
            
            # Auto-scroll to bottom
            scrollbar = self.log_display.verticalScrollBar()
            scrollbar.setValue(scrollbar.maximum())
            
        except Exception as e:
            print(f"Failed to log message: {e}")
    
    def refresh_database_data(self):
        """Refresh database records table"""
        # This is a placeholder for database refresh functionality
        self.log_message("INFO: Database refresh requested (not implemented)")
    
    def closeEvent(self, event):
        """Handle window close event"""
        if self.is_scanning:
            self.stop_scanning()
        event.accept() 