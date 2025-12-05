# Flask Service for Live Inspector

This Flask service provides a REST API for the Live Inspector functionality, allowing you to perform image inspections via HTTP requests.

## Setup

1. **Create and activate virtual environment:**
   ```powershell
   cd python
   .\setup_venv.ps1
   # Or manually:
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

2. **Install dependencies:**
   ```powershell
   pip install -r requirements.txt
   pip install spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64.whl
   ```

3. **Run the Flask service:**
   ```powershell
   cd spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector
   python flask_service.py
   ```

The service will start on `http://localhost:5000`

## API Endpoints

### Health Check
```
GET /health
```
Returns service health status and camera availability.

### Inspect Image
```
POST /api/inspect
```
Perform image inspection against a reference with a mask.

**Request Body (JSON):**
```json
{
  "reference_image": "base64_encoded_string" or "file_path",
  "test_image": "base64_encoded_string" or "file_path" (optional),
  "mask_image": "base64_encoded_string" or "file_path",
  "ssim_threshold": 0.70,
  "corr_threshold": 0.90,
  "use_live_camera": false,
  "return_images": false
}
```

**Response:**
```json
{
  "passed": true,
  "mae": 12.5,
  "ssim": 0.85,
  "corr": 0.95,
  "message": "OK",
  "heatmap": "base64_string" (if return_images=true),
  "overlay": "base64_string" (if return_images=true)
}
```

### Capture Image
```
POST /api/capture
```
Capture a single image from the live camera.

**Request Body (JSON, optional):**
```json
{
  "return_base64": true
}
```

**Response:**
```json
{
  "success": true,
  "image": "base64_string" (if return_base64=true),
  "file_path": "path/to/image.png" (if return_base64=false),
  "width": 1920,
  "height": 1080
}
```

### Upload File
```
POST /api/upload
```
Upload an image file (reference, test, or mask).

**Form Data:**
- `file`: Image file
- `return_base64`: true/false (optional)

**Response:**
```json
{
  "success": true,
  "file_path": "path/to/uploaded/file.png",
  "image": "base64_string" (if return_base64=true)
}
```

### Camera Status
```
GET /api/camera/status
```
Get camera connection status.

**Response:**
```json
{
  "connected": true,
  "mock_mode": false,
  "error": null
}
```

## Example Usage

### Using cURL

```bash
# Health check
curl http://localhost:5000/health

# Inspect with base64 images
curl -X POST http://localhost:5000/api/inspect \
  -H "Content-Type: application/json" \
  -d '{
    "reference_image": "base64_encoded_ref_image",
    "mask_image": "base64_encoded_mask_image",
    "use_live_camera": true,
    "ssim_threshold": 0.70,
    "corr_threshold": 0.90
  }'

# Capture image
curl -X POST http://localhost:5000/api/capture \
  -H "Content-Type: application/json" \
  -d '{"return_base64": true}'
```

### Using Python

```python
import requests
import base64
import cv2

# Read images
ref_img = cv2.imread('reference.png')
mask_img = cv2.imread('mask.png', cv2.IMREAD_GRAYSCALE)

# Encode to base64
_, ref_buffer = cv2.imencode('.png', ref_img)
ref_base64 = base64.b64encode(ref_buffer).decode('utf-8')

_, mask_buffer = cv2.imencode('.png', mask_img)
mask_base64 = base64.b64encode(mask_buffer).decode('utf-8')

# Make request
response = requests.post('http://localhost:5000/api/inspect', json={
    'reference_image': ref_base64,
    'mask_image': mask_base64,
    'use_live_camera': True,
    'ssim_threshold': 0.70,
    'corr_threshold': 0.90,
    'return_images': True
})

result = response.json()
print(f"Passed: {result['passed']}")
print(f"SSIM: {result['ssim']:.3f}")
print(f"Correlation: {result['corr']:.3f}")

# Decode result images if needed
if 'heatmap' in result:
    heatmap_data = base64.b64decode(result['heatmap'])
    nparr = np.frombuffer(heatmap_data, np.uint8)
    heatmap = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    cv2.imwrite('heatmap.png', heatmap)
```

### Using Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

// Read and encode images
const refImage = fs.readFileSync('reference.png').toString('base64');
const maskImage = fs.readFileSync('mask.png').toString('base64');

// Make request
axios.post('http://localhost:5000/api/inspect', {
  reference_image: refImage,
  mask_image: maskImage,
  use_live_camera: true,
  ssim_threshold: 0.70,
  corr_threshold: 0.90
})
.then(response => {
  console.log('Inspection Result:', response.data);
  if (response.data.passed) {
    console.log('✅ Product passed inspection');
  } else {
    console.log('❌ Product failed inspection');
  }
})
.catch(error => {
  console.error('Error:', error.message);
});
```

## Configuration

You can modify the Flask service configuration in `flask_service.py`:

- `MAX_CONTENT_LENGTH`: Maximum file upload size (default: 16MB)
- `UPLOAD_FOLDER`: Directory for temporary file uploads
- Host and port in the `app.run()` call

## Notes

- The service will use mock camera mode if PySpin is not available
- Images can be provided as base64 strings or file paths
- The service automatically resizes masks to match reference image dimensions
- All endpoints return JSON responses
- Error responses include descriptive error messages

