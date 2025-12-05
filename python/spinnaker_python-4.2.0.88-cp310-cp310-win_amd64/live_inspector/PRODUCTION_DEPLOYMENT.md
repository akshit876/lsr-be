# Production Deployment Guide - Flask Live Inspector Service

## Overview

This guide covers deploying the Flask Live Inspector Service in a production environment.

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Flask Service Configuration
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
FLASK_DEBUG=False
LOG_LEVEL=INFO

# Default Image Paths
DEFAULT_REF_PATH=D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector\capture_0001.png
DEFAULT_MASK_PATH=D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector\mask_saved.png
```

### Default Paths

The service uses default paths for reference and mask images:
- **Reference**: `capture_0001.png` (in live_inspector folder)
- **Mask**: `mask_saved.png` (in live_inspector folder)

These paths can be overridden via:
1. Environment variables (`DEFAULT_REF_PATH`, `DEFAULT_MASK_PATH`)
2. API request parameters (if provided, they override defaults)

## Running in Production

### Option 1: Direct Python (Development/Testing)

```powershell
cd python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector
conda activate ..\..\venv
python flask_service.py
```

### Option 2: Using Gunicorn (Recommended for Production)

```bash
# Install gunicorn
pip install gunicorn

# Run with gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 flask_service:app
```

### Option 3: Windows Service (Using NSSM)

1. Download NSSM (Non-Sucking Service Manager)
2. Install as Windows Service:

```powershell
nssm install FlaskLiveInspector "C:\path\to\python.exe" "D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector\flask_service.py"
nssm set FlaskLiveInspector AppDirectory "D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector"
nssm set FlaskLiveInspector AppEnvironmentExtra "FLASK_DEBUG=False"
nssm start FlaskLiveInspector
```

## Logging

Logs are automatically saved to:
- `logs/flask_service.log` - Rotating log file (10MB, 5 backups)
- Console output

Log levels:
- `DEBUG` - Detailed information
- `INFO` - General information (default)
- `WARNING` - Warning messages
- `ERROR` - Error messages

## API Endpoints

### Health Check
```
GET /health
```

### Inspection (Uses Default Paths)
```
POST /api/inspect
{
  "ssim_threshold": 0.70,
  "corr_threshold": 0.90,
  "use_live_camera": true
}
```

### Inspection (Custom Paths)
```
POST /api/inspect
{
  "reference_image": "path/to/ref.png",
  "mask_image": "path/to/mask.png",
  "use_live_camera": true,
  "ssim_threshold": 0.70,
  "corr_threshold": 0.90
}
```

### Get Configuration
```
GET /api/config
```

## Node.js Integration

The service automatically uses default paths if not provided:

```javascript
import { runLiveInspection } from './services/liveInspectorService.js';

// Uses default paths automatically
const result = await runLiveInspection(null, null, 0.70, 0.90);

// Or with custom paths
const result = await runLiveInspection(
  'path/to/custom_ref.png',
  'path/to/custom_mask.png',
  0.70,
  0.90
);
```

## Security Considerations

1. **Firewall**: Only expose port 5000 to internal network
2. **Authentication**: Add authentication middleware if exposed externally
3. **Rate Limiting**: Consider adding rate limiting for production
4. **HTTPS**: Use reverse proxy (nginx) with SSL for external access

## Monitoring

- Check `/health` endpoint regularly
- Monitor log files for errors
- Set up alerts for repeated failures
- Monitor camera connection status via `/api/camera/status`

## Troubleshooting

### Service Won't Start
- Check if port 5000 is already in use
- Verify conda environment is activated
- Check log files for errors

### Camera Not Available
- Service will work in "mock mode" if camera unavailable
- Check camera connection via `/api/camera/status`
- Review camera logs

### Default Paths Not Found
- Verify paths exist and are accessible
- Check file permissions
- Use `/api/config` to verify configured paths

## Performance

- Preprocessing is enabled by default (fast Gaussian blur)
- Image analysis typically takes 50-200ms
- Camera capture takes 30-100ms
- Total inspection time: ~100-300ms

