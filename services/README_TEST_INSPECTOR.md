# Testing Live Inspector Service

## Quick Test

Run the test script:

```bash
npm run test:inspector
```

Or directly:

```bash
node services/testLiveInspector.js
```

## Test with Custom Paths

```bash
node services/testLiveInspector.js --ref path/to/reference.png --mask path/to/mask.png
```

## What the Test Does

The test script runs 5 tests:

1. **Health Check** - Verifies Flask service is running
2. **Camera Status** - Checks camera connection
3. **Capture Image** - Tests image capture from camera
4. **Live Inspection** - Runs inspection using default paths
5. **Inspection with Options** - Tests full inspection API

## Expected Output

```
🚀 Starting Live Inspector Service Tests

============================================================
Test 1: Health Check
============================================================
✓ Service Status: healthy
  Camera Available: YES
  Default Ref Path: D:\lsr-be\python\...
  Default Mask Path: D:\lsr-be\python\...

============================================================
Test 2: Camera Status
============================================================
✓ Camera Connected: YES
  Mock Mode: NO

============================================================
Test 3: Capture Image
============================================================
Capturing image from camera...
✓ Image captured successfully
  Dimensions: 1920 x 1080
  File Path: C:\Users\...

============================================================
Test 4: Live Inspection (Using Default Paths)
============================================================
Running inspection with live camera...
  Reference: DEFAULT
  Mask: DEFAULT
  SSIM Threshold: 0.70
  Correlation Threshold: 0.90

✓ Inspection completed in 0.25s
  Status: PASS
  MAE: 12.50
  SSIM: 0.8500
  Correlation: 0.9500
  Message: OK

✅ PRODUCT PASSED INSPECTION
```

## Troubleshooting

### Service Not Available
- Make sure Flask service is running on port 5000
- Check `FLASK_API_URL` environment variable

### Camera Not Available
- Service will work in mock mode
- Check camera connection

### Default Paths Not Found
- Verify default paths exist
- Use `--ref` and `--mask` flags to specify custom paths

## Integration Example

```javascript
import { runLiveInspection } from './services/liveInspectorService.js';

// Simple usage with defaults
const result = await runLiveInspection(null, null, 0.70, 0.90);

if (result.passed) {
  console.log('✅ Product passed');
} else {
  console.log('❌ Product failed');
}
```

