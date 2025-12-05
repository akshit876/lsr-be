/**
 * Simple test script for Live Inspector Service
 * 
 * Usage:
 *   node services/testLiveInspector.js
 * 
 * Or with custom paths:
 *   node services/testLiveInspector.js --ref path/to/ref.png --mask path/to/mask.png
 */

import {
  checkHealth,
  getCameraStatus,
  captureImage,
  runLiveInspection,
  runInspection,
} from './liveInspectorService.js';

// Parse command line arguments
const args = process.argv.slice(2);
let customRefPath = null;
let customMaskPath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ref' && args[i + 1]) {
    customRefPath = args[i + 1];
    i++;
  } else if (args[i] === '--mask' && args[i + 1]) {
    customMaskPath = args[i + 1];
    i++;
  }
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function separator() {
  console.log('='.repeat(60));
}

async function testHealthCheck() {
  separator();
  log('Test 1: Health Check', 'cyan');
  separator();
  
  try {
    const health = await checkHealth();
    log(`✓ Service Status: ${health.status}`, 'green');
    log(`  Camera Available: ${health.camera_available ? 'YES' : 'NO'}`);
    if (health.camera_error) {
      log(`  Camera Error: ${health.camera_error}`, 'yellow');
    }
    if (health.default_ref_path) {
      log(`  Default Ref Path: ${health.default_ref_path}`);
    }
    if (health.default_mask_path) {
      log(`  Default Mask Path: ${health.default_mask_path}`);
    }
    return true;
  } catch (error) {
    log(`✗ Health check failed: ${error.message}`, 'red');
    return false;
  }
}

async function testCameraStatus() {
  separator();
  log('Test 2: Camera Status', 'cyan');
  separator();
  
  try {
    const status = await getCameraStatus();
    log(`✓ Camera Connected: ${status.connected ? 'YES' : 'NO'}`, status.connected ? 'green' : 'yellow');
    log(`  Mock Mode: ${status.mock_mode ? 'YES' : 'NO'}`);
    if (status.error) {
      log(`  Error: ${status.error}`, 'yellow');
    }
    return true;
  } catch (error) {
    log(`✗ Camera status check failed: ${error.message}`, 'red');
    return false;
  }
}

async function testCaptureImage() {
  separator();
  log('Test 3: Capture Image', 'cyan');
  separator();
  
  try {
    log('Capturing image from camera...', 'blue');
    const result = await captureImage(false);
    
    if (result.success) {
      log(`✓ Image captured successfully`, 'green');
      log(`  Dimensions: ${result.width} x ${result.height}`);
      log(`  File Path: ${result.file_path}`);
      return true;
    } else {
      log(`✗ Capture failed: ${result.error || 'Unknown error'}`, 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Capture failed: ${error.message}`, 'red');
    return false;
  }
}

async function testLiveInspection() {
  separator();
  log('Test 4: Live Inspection (Using Default Paths)', 'cyan');
  separator();
  
  try {
    log('Running inspection with live camera...', 'blue');
    log(`  Reference: ${customRefPath || 'DEFAULT'}`);
    log(`  Mask: ${customMaskPath || 'DEFAULT'}`);
    log(`  SSIM Threshold: 0.70`);
    log(`  Correlation Threshold: 0.90`);
    
    const startTime = Date.now();
    const result = await runLiveInspection(
      customRefPath,
      customMaskPath,
      0.70,
      0.90
    );
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    log(`\n✓ Inspection completed in ${elapsed}s`, 'green');
    log(`  Status: ${result.passed ? 'PASS' : 'FAIL'}`, result.passed ? 'green' : 'red');
    log(`  MAE: ${result.mae.toFixed(2)}`);
    log(`  SSIM: ${result.ssim.toFixed(4)}`);
    log(`  Correlation: ${result.corr.toFixed(4)}`);
    log(`  Message: ${result.message || 'OK'}`);
    
    if (result.passed) {
      log('\n✅ PRODUCT PASSED INSPECTION', 'green');
    } else {
      log('\n❌ PRODUCT FAILED INSPECTION', 'red');
    }
    
    return true;
  } catch (error) {
    log(`✗ Inspection failed: ${error.message}`, 'red');
    return false;
  }
}

async function testInspectionWithOptions() {
  separator();
  log('Test 5: Inspection with Full Options', 'cyan');
  separator();
  
  try {
    log('Running inspection with custom options...', 'blue');
    
    const startTime = Date.now();
    const result = await runInspection({
      referenceImage: customRefPath, // null = use default
      maskImage: customMaskPath,     // null = use default
      useLiveCamera: true,
      ssimThreshold: 0.70,
      corrThreshold: 0.90,
      returnImages: false,
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    log(`\n✓ Inspection completed in ${elapsed}s`, 'green');
    log(`  Status: ${result.passed ? 'PASS' : 'FAIL'}`, result.passed ? 'green' : 'red');
    log(`  MAE: ${result.mae.toFixed(2)}`);
    log(`  SSIM: ${result.ssim.toFixed(4)}`);
    log(`  Correlation: ${result.corr.toFixed(4)}`);
    
    return true;
  } catch (error) {
    log(`✗ Inspection failed: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('\n🚀 Starting Live Inspector Service Tests\n', 'cyan');
  
  const results = {
    passed: 0,
    failed: 0,
  };
  
  // Test 1: Health Check
  if (await testHealthCheck()) {
    results.passed++;
  } else {
    results.failed++;
    log('\n⚠️  Service is not available. Stopping tests.', 'yellow');
    return;
  }
  
  // Test 2: Camera Status
  if (await testCameraStatus()) {
    results.passed++;
  } else {
    results.failed++;
  }
  
  // Test 3: Capture Image (optional - may fail if camera not available)
  try {
    if (await testCaptureImage()) {
      results.passed++;
    } else {
      results.failed++;
    }
  } catch (error) {
    log(`⚠️  Skipping capture test: ${error.message}`, 'yellow');
  }
  
  // Test 4: Live Inspection
  if (await testLiveInspection()) {
    results.passed++;
  } else {
    results.failed++;
  }
  
  // Test 5: Inspection with Options
  if (await testInspectionWithOptions()) {
    results.passed++;
  } else {
    results.failed++;
  }
  
  // Summary
  separator();
  log('\n📊 Test Summary', 'cyan');
  separator();
  log(`Total Tests: ${results.passed + results.failed}`);
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  separator();
  
  if (results.failed === 0) {
    log('\n✅ All tests passed!', 'green');
    process.exit(0);
  } else {
    log('\n❌ Some tests failed', 'red');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  log(`\n💥 Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

