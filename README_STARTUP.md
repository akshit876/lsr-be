# Project Startup Scripts

## Quick Start

### Simple Startup (Recommended)
```batch
start-project.bat
```

### Advanced Startup (With Error Handling)
```batch
start-project-advanced.bat
```

### Stop All Services
```batch
stop-project.bat
```

## What Gets Started

1. **Node.js Backend** (`D:\lsr-be`)
   - Port: 3002
   - Command: `npm run start`

2. **Flask Live Inspector Service** (`D:\lsr-be\python\...\live_inspector`)
   - Port: 5000
   - Command: `python flask_service.py`
   - Uses conda venv at `D:\lsr-be\python\venv`

3. **Next.js Frontend** (`D:\MecObsr`)
   - Port: 3000
   - Command: `npm run start`

4. **Chrome Browser**
   - Opens in incognito mode
   - URL: http://localhost:3000

## Configuration

Edit the batch files to change:
- Directory paths
- Port numbers
- Chrome path
- Startup delays

## Troubleshooting

### Flask Service Won't Start

1. **Check venv Python exists:**
   ```batch
   dir D:\lsr-be\python\venv\Scripts\python.exe
   ```

2. **Test Flask service manually:**
   ```batch
   cd D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector
   D:\lsr-be\python\venv\Scripts\python.exe flask_service.py
   ```

3. **Or use the test script:**
   ```batch
   start-flask-only.bat
   ```

4. **If venv doesn't work, check if it was created properly:**
   ```batch
   cd D:\lsr-be\python
   python -m venv venv
   ```

### Services Already Running

If ports are in use:
```batch
stop-project.bat
```

Then restart:
```batch
start-project.bat
```

### Check Service Status

- **Node.js Backend:** http://localhost:3002
- **Flask Service:** http://localhost:5000/health
- **Next.js Frontend:** http://localhost:3000

## Manual Startup

If batch files don't work, start manually:

### Terminal 1: Node.js Backend
```batch
cd D:\lsr-be
npm run start
```

### Terminal 2: Flask Service
```batch
cd D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector
D:\lsr-be\python\venv\Scripts\python.exe flask_service.py
```

### Terminal 3: Next.js Frontend
```batch
cd D:\MecObsr
npm run start
```

## Notes

- All services run in hidden windows
- Services start with delays to allow initialization
- Chrome opens automatically after all services start
- Use `stop-project.bat` to stop all services at once

