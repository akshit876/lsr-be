/**
 * Example usage of Live Inspector Service
 * 
 * This shows how to use the liveInspectorService in your Node.js backend
 */

import {
    checkHealth,
    getCameraStatus,
    captureImage,
    runLiveInspection,
    runInspection,
    runInspectionWithTestImage
} from './liveInspectorService.js';

// Example 1: Check if Flask service is running
async function example1_checkHealth() {
    try {
        const health = await checkHealth();
        console.log('Flask Service Health:', health);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Example 2: Get camera status
async function example2_cameraStatus() {
    try {
        const status = await getCameraStatus();
        console.log('Camera Status:', status);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Example 3: Capture image from camera
async function example3_captureImage() {
    try {
        const result = await captureImage(true); // Return as base64
        console.log('Captured image dimensions:', result.width, 'x', result.height);
        // result.image contains base64 string
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Example 4: Run inspection (same as old node_integration_example.js)
async function example4_simpleInspection() {
    try {
        const refPath = 'path/to/reference.png';
        const maskPath = 'path/to/mask.png';
        
        const result = await runLiveInspection(refPath, maskPath, 0.70, 0.90);
        
        console.log('Inspection Result:', result);
        if (result.passed) {
            console.log('✅ PRODUCT OK');
            console.log(`SSIM: ${result.ssim.toFixed(3)}, Correlation: ${result.corr.toFixed(3)}`);
        } else {
            console.log('❌ PRODUCT DEFECTIVE');
            console.log(`SSIM: ${result.ssim.toFixed(3)}, Correlation: ${result.corr.toFixed(3)}`);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Example 5: Run inspection with test image (not from camera)
async function example5_inspectionWithTestImage() {
    try {
        const refPath = 'path/to/reference.png';
        const testPath = 'path/to/test.png';
        const maskPath = 'path/to/mask.png';
        
        const result = await runInspectionWithTestImage(refPath, testPath, maskPath, 0.70, 0.90);
        
        console.log('Inspection Result:', result);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Example 6: Run inspection with full options (including result images)
async function example6_fullInspection() {
    try {
        const result = await runInspection({
            referenceImage: 'path/to/reference.png',
            maskImage: 'path/to/mask.png',
            useLiveCamera: true, // Use live camera
            ssimThreshold: 0.70,
            corrThreshold: 0.90,
            returnImages: true, // Get heatmap and overlay
            imagesAsBase64: true
        });
        
        console.log('Inspection Result:', {
            passed: result.passed,
            mae: result.mae,
            ssim: result.ssim,
            corr: result.corr
        });
        
        // If returnImages=true, you'll have:
        // result.heatmap - base64 encoded heatmap image
        // result.overlay - base64 encoded overlay image
        
        if (result.heatmap) {
            // Save heatmap image
            const fs = require('fs');
            const heatmapBuffer = Buffer.from(result.heatmap, 'base64');
            fs.writeFileSync('heatmap_result.png', heatmapBuffer);
            console.log('Heatmap saved to heatmap_result.png');
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Example 7: Use in Express/HTTP route handler
async function example7_expressRoute(req, res) {
    try {
        const { referencePath, maskPath, ssimThreshold, corrThreshold } = req.body;
        
        const result = await runLiveInspection(
            referencePath,
            maskPath,
            ssimThreshold || 0.70,
            corrThreshold || 0.90
        );
        
        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// Example 8: Use in Socket.IO event handler
async function example8_socketHandler(socket) {
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
}

// Run examples
if (require.main === module) {
    (async () => {
        console.log('=== Example 1: Health Check ===');
        await example1_checkHealth();
        
        console.log('\n=== Example 2: Camera Status ===');
        await example2_cameraStatus();
        
        console.log('\n=== Example 4: Simple Inspection ===');
        // Uncomment and set paths to test
        // await example4_simpleInspection();
    })();
}

export {
    example1_checkHealth,
    example2_cameraStatus,
    example3_captureImage,
    example4_simpleInspection,
    example5_inspectionWithTestImage,
    example6_fullInspection,
    example7_expressRoute,
    example8_socketHandler
};

