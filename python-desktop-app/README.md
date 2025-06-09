# Scanner Desktop Application

A modern Python desktop application for scanner control and data management, converted from the original Node.js web application to provide a better desktop experience.

## Features

### Core Functionality

- **TCP Scanner Communication**: Modern TCP-based scanner interface (replaces RS232)
- **Modbus PLC Integration**: Full Modbus TCP support for PLC communication
- **Real-time Data Processing**: Live scanner data reception and processing
- **Database Management**: MongoDB integration for data storage and retrieval
- **Barcode Generation**: Automated barcode generation and management
- **System Monitoring**: Real-time monitoring of all system components

### Desktop Experience

- **Native Desktop UI**: Professional PyQt5-based interface
- **System Tray Integration**: Minimize to system tray for background operation
- **Multi-tab Interface**: Organized tabs for different functions
- **Real-time Updates**: Live status updates and data visualization
- **Configuration Management**: Easy-to-use configuration dialogs
- **Data Export**: Excel and CSV export functionality

### Key Improvements Over Web Version

- **Better Performance**: Native desktop performance vs web browser overhead
- **Enhanced UI/UX**: Desktop-native components and interactions
- **Offline Operation**: Works without web server dependencies
- **System Integration**: Better OS integration and notifications
- **Direct Hardware Access**: More reliable hardware communication
- **Resource Management**: Better memory and CPU usage

## Architecture

```
python-desktop-app/
├── main.py                     # Application entry point
├── requirements.txt            # Python dependencies
├── config.json                # Configuration file
├── README.md                  # This file
│
├── ui/                        # User Interface
│   ├── main_window.py         # Main application window
│   ├── scanner_tab.py         # Scanner control tab
│   ├── data_tab.py           # Data management tab
│   ├── config_dialog.py      # Configuration dialog
│   └── status_widget.py      # Status indicators
│
├── services/                  # Core Services
│   ├── scanner_service.py     # TCP scanner communication
│   ├── modbus_service.py      # Modbus PLC communication
│   ├── database_service.py    # MongoDB data management
│   └── barcode_service.py     # Barcode generation
│
├── utils/                     # Utilities
│   ├── config.py             # Configuration management
│   ├── logger.py             # Logging utilities
│   └── data_export.py        # Data export functionality
│
└── assets/                    # Resources
    ├── icons/                # Application icons
    └── styles/               # UI stylesheets
```

## Installation

### Prerequisites

- Python 3.8 or higher
- MongoDB server
- Network access to scanner and PLC devices

### Steps

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd python-desktop-app
   ```

2. **Create virtual environment:**

   ```bash
   python -m venv venv

   # On Windows:
   venv\Scripts\activate

   # On Linux/Mac:
   source venv/bin/activate
   ```

3. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

4. **Configure the application:**

   - Copy `config.example.json` to `config.json`
   - Edit `config.json` with your settings:
     ```json
     {
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
         "show_system_tray": true,
         "minimize_to_tray": true
       }
     }
     ```

5. **Run the application:**
   ```bash
   python main.py
   ```

## Configuration

### Environment Variables

You can override configuration using environment variables:

```bash
# Scanner Configuration
export SCANNER_HOST=192.168.1.100
export SCANNER_PORT=4001
export SCANNER_TIMEOUT=10

# Modbus Configuration
export MODBUS_HOST=192.168.3.146
export MODBUS_PORT=502
export MODBUS_SLAVE_ID=1

# Database Configuration
export MONGODB_URI=mongodb://localhost:27017
export DATABASE_NAME=main-data
export COLLECTION_NAME=records

# UI Configuration
export UI_THEME=dark
export LOG_LEVEL=DEBUG
```

### Scanner Setup

The application now uses TCP communication instead of RS232:

1. **Configure your scanner for TCP mode:**

   - Set scanner IP address (e.g., 192.168.1.100)
   - Set scanner port (e.g., 4001)
   - Enable TCP communication mode

2. **Update configuration:**
   - Set `scanner.host` to your scanner's IP
   - Set `scanner.port` to your scanner's port
   - Adjust timeout if needed

### PLC Setup

Ensure your PLC is configured for Modbus TCP:

1. **PLC Configuration:**

   - Enable Modbus TCP on the PLC
   - Set the correct IP address and port
   - Configure holding registers as needed

2. **Network Configuration:**
   - Ensure network connectivity between PC and PLC
   - Check firewall settings
   - Verify IP addresses and ports

## Usage

### Starting the Application

1. Run `python main.py`
2. The application will initialize all services
3. Check the status indicators for connection status
4. The application can minimize to system tray

### Scanner Operations

1. **Manual Scan Trigger:**

   - Click "Trigger Scan" button
   - Scanner data will appear in real-time

2. **Automatic Scanning:**

   - Enable automatic mode
   - Scanner will respond to PLC triggers

3. **Data Processing:**
   - Scanner data is automatically processed
   - Results are stored in database
   - Real-time updates shown in UI

### Data Management

1. **View Records:**

   - Browse historical scan data
   - Filter by date, model, etc.
   - Real-time record updates

2. **Export Data:**

   - Export to Excel or CSV
   - Select date ranges
   - Filter by criteria

3. **Database Operations:**
   - Monitor database connection
   - View connection statistics
   - Manual backup/restore

### System Monitoring

1. **Connection Status:**

   - Scanner connection indicator
   - PLC connection indicator
   - Database connection indicator

2. **Performance Metrics:**

   - Scan processing time
   - Database query performance
   - Network latency

3. **Error Handling:**
   - Automatic reconnection
   - Error logging and display
   - Recovery procedures

## Troubleshooting

### Common Issues

1. **Scanner Connection Failed:**

   ```
   Error: Connection timeout to 192.168.1.100:4001
   ```

   - Check scanner IP address and port
   - Verify network connectivity
   - Test with `ping 192.168.1.100`
   - Check firewall settings

2. **PLC Connection Failed:**

   ```
   Error: Failed to connect to PLC
   ```

   - Verify PLC IP address and port
   - Check Modbus TCP settings on PLC
   - Test network connectivity
   - Verify slave ID configuration

3. **Database Connection Failed:**

   ```
   Error: MongoDB connection refused
   ```

   - Check if MongoDB service is running
   - Verify connection string
   - Check database permissions
   - Test with MongoDB client

4. **Application Won't Start:**
   ```
   ImportError: No module named 'PyQt5'
   ```
   - Ensure virtual environment is activated
   - Run `pip install -r requirements.txt`
   - Check Python version compatibility

### Logging

Check the log files for detailed error information:

- `scanner_app.log` - Application logs
- `scanner_service.log` - Scanner communication logs
- `modbus_service.log` - PLC communication logs

### Performance Tips

1. **Optimize Database:**

   - Create indexes on frequently queried fields
   - Regular database maintenance
   - Monitor connection pool usage

2. **Network Optimization:**

   - Use wired connections when possible
   - Minimize network latency
   - Configure appropriate timeouts

3. **System Resources:**
   - Monitor CPU and memory usage
   - Close unnecessary applications
   - Ensure adequate disk space

## Development

### Building from Source

1. Install development dependencies:

   ```bash
   pip install -r requirements-dev.txt
   ```

2. Run tests:

   ```bash
   python -m pytest tests/
   ```

3. Build executable:
   ```bash
   python build.py
   ```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Migration from Node.js Version

### Key Changes

1. **Scanner Communication:** RS232 → TCP
2. **UI Framework:** Web → PyQt5 Desktop
3. **Runtime:** Node.js → Python
4. **Configuration:** Environment files → JSON config

### Migration Steps

1. **Export Data:** Backup your MongoDB data
2. **Update Scanner:** Configure for TCP mode
3. **Install Python App:** Follow installation steps
4. **Configure Settings:** Transfer your configuration
5. **Test Functionality:** Verify all features work
6. **Deploy:** Replace Node.js version

### Feature Parity

All features from the Node.js version are available:

- ✅ Scanner data processing
- ✅ PLC communication
- ✅ Database management
- ✅ Barcode generation
- ✅ Data export
- ✅ System monitoring
- ✅ Error handling
- ✅ Configuration management

## Support

For support and questions:

- Check the troubleshooting section
- Review log files for errors
- Create an issue on the repository
- Contact the development team

## License

This project is licensed under the MIT License - see the LICENSE file for details.
