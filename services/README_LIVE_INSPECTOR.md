# Live Inspector Service - Node.js Integration

This service provides Node.js functions to interact with the Flask-based Live Inspector API, replacing the need to spawn Python processes directly.

## Setup

1. **Install dependencies:**
   ```bash
   npm install axios form-data
   ```

2. **Set Flask API URL (optional):**
   ```bash
   # In your .env file or environment
   FLASK_API_URL=http://localhost:5000
   ```
   Default is `http://localhost:5000`

3. **Make sure Flask service is running:**
   ```powershell
   cd python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector
   conda activate ..\..\venv
   python flask_service.py
   ```

## Main Function: `runLiveInspection`

This is the main function you'll use - it's equivalent to the Qt GUI's inspection functionality.

### Basic Usage (Same as old node_integration_example.js)

```javascript
import { runLiveInspection } from './services/liveInspectorService.js';

// Simple usage - uses live camera
const result = await runLiveInspection(
    'path/to/reference.png',  // Reference image path
    'path/to/mask.png',       // Mask image path
    0.70,                     // SSIM threshold
    0.90                      // Correlation threshold
);

if (result.passed) {
    console.log('✅ PRODUCT OK');
} else {
    console.log('❌ PRODUCT DEFECTIVE');
}
```

### Response Format

```javascript
{
    passed: true,           // boolean - whether inspection passed
    mae: 12.5,             // number - Mean Absolute Error
    ssim: 0.85,            // number - SSIM score (0.0 - 1.0)
    corr: 0.95,            // number - Correlation score (0.0 - 1.0)
    message: "OK"          // string - Status message
}
```

## Advanced Usage: `runInspection`

For more control, use `runInspection` with full options:

```javascript
import { runInspection } from './services/liveInspectorService.js';

const result = await runInspection({
    referenceImage: 'path/to/reference.png',  // or base64 string
    maskImage: 'path/to/mask.png',            // or base64 string
    testImage: 'path/to/test.png',            // optional - if not provided, uses live camera
    useLiveCamera: true,                      // use camera if testImage not provided
    ssimThreshold: 0.70,
    corrThreshold: 0.90,
    returnImages: true,                       // get heatmap and overlay images
    imagesAsBase64: true                     // return images as base64 strings
});

// If returnImages=true:
// result.heatmap - base64 encoded heatmap image
// result.overlay - base64 encoded overlay image
```

## All Available Functions

### `checkHealth()`
Check if Flask service is running and healthy.

```javascript
const health = await checkHealth();
// Returns: { status: 'healthy', camera_available: true, ... }
```

### `getCameraStatus()`
Get camera connection status.

```javascript
const status = await getCameraStatus();
// Returns: { connected: true, mock_mode: false, error: null }
```

### `captureImage(returnBase64 = false)`
Capture a single image from the live camera.

```javascript
const result = await captureImage(true);
// Returns: { success: true, image: "base64_string", width: 1920, height: 1080 }
```

### `runLiveInspection(refPath, maskPath, ssimThresh, corrThresh)`
Simple inspection using live camera (backward compatible with old code).

### `runInspection(options)`
Full-featured inspection with all options.

### `runInspectionWithTestImage(refPath, testPath, maskPath, ssimThresh, corrThresh)`
Run inspection with a specific test image (not from camera).

## Integration Examples

### Example 1: Use in Express Route

```javascript
import express from 'express';
import { runLiveInspection } from './services/liveInspectorService.js';

const app = express();
app.use(express.json());

app.post('/api/inspect', async (req, res) => {
    try {
        const { referencePath, maskPath, ssimThreshold, corrThreshold } = req.body;
        
        const result = await runLiveInspection(
            referencePath,
            maskPath,
            ssimThreshold || 0.70,
            corrThreshold || 0.90
        );
        
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
```

### Example 2: Use in Socket.IO Handler

```javascript
import { runLiveInspection } from './services/liveInspectorService.js';

io.on('connection', (socket) => {
    socket.on('run-inspection', async (data) => {
        try {
            const { referencePath, maskPath, ssimThreshold, corrThreshold } = data;
            
            const result = await runLiveInspection(
                referencePath,
                maskPath,
                ssimThreshold || 0.70,
                corrThreshold || 0.90
            );
            
            socket.emit('inspection-result', {
                success: true,
                result: result
            });
        } catch (error) {
            socket.emit('inspection-error', {
                success: false,
                error: error.message
            });
        }
    });
});
```

### Example 3: Replace Old Python Spawn Code

**Old way (spawning Python):**
```javascript
const { spawn } = require('child_process');
const pythonProcess = spawn('python', ['script.py', ...args]);
// ... handle stdout/stderr
```

**New way (Flask API):**
```javascript
import { runLiveInspection } from './services/liveInspectorService.js';
const result = await runLiveInspection(refPath, maskPath, 0.70, 0.90);
```

## Mapping Qt GUI Features to Flask Endpoints

| Qt GUI Feature | Flask Endpoint | Node.js Function |
|---------------|----------------|------------------|
| "SET REF" (Capture Reference) | `POST /api/capture` | `captureImage()` |
| "SNAP CHECK" (Single Inspection) | `POST /api/inspect` | `runInspection()` or `runLiveInspection()` |
| Live Stream Inspection | `POST /api/inspect` with `use_live_camera: true` | `runInspection({ useLiveCamera: true })` |
| Load Mask Image | `POST /api/upload` | `uploadImage()` |
| Get Results (Pass/Fail) | `POST /api/inspect` response | `result.passed`, `result.ssim`, `result.corr` |
| Get Heatmap/Overlay | `POST /api/inspect` with `return_images: true` | `result.heatmap`, `result.overlay` |

## Error Handling

All functions throw errors that should be caught:

```javascript
try {
    const result = await runLiveInspection(refPath, maskPath);
} catch (error) {
    console.error('Inspection failed:', error.message);
    // Handle error (e.g., Flask service down, camera unavailable, etc.)
}
```

## Environment Variables

- `FLASK_API_URL` - Flask service URL (default: `http://localhost:5000`)

## Notes

- The service automatically converts file paths to base64 when needed
- If Flask service is not running, all functions will throw errors
- Camera will work in "mock mode" if no physical camera is connected (for testing)
- All image paths should be absolute paths or relative to the current working directory

