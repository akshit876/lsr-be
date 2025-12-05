# Quick Start Guide - Running the Flask Service

## Step 1: Activate Your Conda Environment

First, make sure you're in the `python` folder and activate your conda environment:

```powershell
cd D:\stuffs\lsr-be\python
conda activate .\venv
```

You should see `(venv)` in your PowerShell prompt, indicating the environment is active.

## Step 2: Install Dependencies (if not already done)

```powershell
pip install -r requirements.txt
pip install spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64.whl
```

## Step 3: Navigate to the Flask Service Directory

```powershell
cd spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector
```

## Step 4: Run the Flask Service

```powershell
python flask_service.py
```

You should see output like:

```
 * Running on http://0.0.0.0:5000
 * Debug mode: on
```

The service is now running on **http://localhost:5000**

## Step 5: Test the Service

### Option A: Using PowerShell (Invoke-WebRequest)

Open a **NEW PowerShell window** (keep the Flask service running in the first one) and run:

```powershell
# Health check
Invoke-WebRequest -Uri http://localhost:5000/health -Method GET | Select-Object -ExpandProperty Content

# Camera status
Invoke-WebRequest -Uri http://localhost:5000/api/camera/status -Method GET | Select-Object -ExpandProperty Content
```

### Option B: Using Browser

Simply open your web browser and go to:

- **http://localhost:5000/health** - Check if service is running
- **http://localhost:5000/api/camera/status** - Check camera status

### Option C: Using Python Script

Create a test file `test_api.py` in the same folder:

```python
import requests

# Test health endpoint
response = requests.get('http://localhost:5000/health')
print("Health Check:", response.json())

# Test camera status
response = requests.get('http://localhost:5000/api/camera/status')
print("Camera Status:", response.json())
```

Run it:

```powershell
python test_api.py
```

## Available Endpoints

Once the service is running, you can access:

1. **GET /health** - Service health check
2. **GET /api/camera/status** - Camera connection status
3. **POST /api/capture** - Capture image from camera
4. **POST /api/inspect** - Perform image inspection
5. **POST /api/upload** - Upload image files

## Stopping the Service

Press `Ctrl + C` in the PowerShell window where Flask is running to stop the service.

## Troubleshooting

### Port Already in Use

If you get an error that port 5000 is already in use, you can change the port in `flask_service.py`:

```python
app.run(host='0.0.0.0', port=5001, debug=True)  # Change 5000 to 5001
```

### Module Not Found Errors

Make sure you've activated the conda environment and installed all dependencies:

```powershell
conda activate .\venv
pip install -r requirements.txt
```

### Camera Not Available

The service will work in "mock mode" if no camera is connected. This is fine for testing!
