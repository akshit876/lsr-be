#!/usr/bin/env node

/**
 * Simple Test for New Scan System
 * 
 * This script tests the basic functionality without starting a full server.
 */

/* eslint-env node */
import ScanCycleManager from './services/ScanCycleManager.js';
import logger from './logger.js';

async function testSimpleScan() {
  try {
    logger.info('🧪 Testing Simple Scan System...');
    
    // Create scan cycle manager
    const scanCycleManager = new ScanCycleManager();
    
    // Test initialization
    logger.info('🔌 Initializing scan cycle manager...');
    await scanCycleManager.initialize();
    
    // Check status
    const status = scanCycleManager.getStatus();
    logger.info('📊 Status:', JSON.stringify(status, null, 2));
    
    // Test bit clearing
    logger.info('🧹 Testing bit clearing...');
    await scanCycleManager.clearAllBits();
    
    // Test cleanup
    logger.info('🧹 Cleaning up...');
    await scanCycleManager.cleanup();
    
    logger.success('✅ Simple scan test completed successfully!');
    
  } catch (error) {
    logger.error('❌ Simple scan test failed:', error.message);
    logger.error('Stack trace:', error.stack);
  }
}

// Run the test
testSimpleScan();
