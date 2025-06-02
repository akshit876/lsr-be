import SerialNumberGeneratorService from "./serialNumber.js";
import logger from "../logger.js";

// This file provides utility functions for manual serial reset management
// The system now uses reactive "first run after 6:00 AM" reset behavior per model

// Manual reset function (for admin use)
export async function manualSerialReset() {
  try {
    logger.info("🔧 Performing manual serial reset...");
    const result = await SerialNumberGeneratorService.forceReset();
    return result;
  } catch (error) {
    logger.error("❌ Manual serial reset failed:", error);
    throw error;
  }
}

// Check reset status without performing reset
export async function checkSerialResetStatus() {
  try {
    const status = await SerialNumberGeneratorService.checkResetStatus();
    return status;
  } catch (error) {
    logger.error("❌ Failed to check serial reset status:", error);
    throw error;
  }
}

// Check if a specific model needs reset (useful for monitoring)
export async function checkModelResetStatus(modelNumber) {
  try {
    // This will check the model-specific reset status
    const currentModel =
      await SerialNumberGeneratorService.getCurrentModelNumber();
    logger.info(`🔍 Checking reset status for current model: ${currentModel}`);

    if (modelNumber && modelNumber !== currentModel) {
      logger.warn(
        `⚠️ Requested model ${modelNumber} differs from current model ${currentModel}`
      );
    }

    const status = await SerialNumberGeneratorService.checkResetStatus();
    return {
      ...status,
      requestedModel: modelNumber,
      actualCurrentModel: currentModel,
    };
  } catch (error) {
    logger.error(
      `❌ Failed to check reset status for model ${modelNumber}:`,
      error
    );
    throw error;
  }
}

// Get the expected reset behavior summary
export function getResetBehaviorSummary() {
  return {
    resetType: "reactive",
    description:
      "Reset happens on first machine operation after 6:00 AM each day",
    modelSpecific: true,
    independentResets: true,
    resetRules: {
      "CMB-877": "Resets to S7001 on first run after 6:00 AM",
      "CMB-778": "Resets to S0001 on first run after 6:00 AM",
      "Other models": "Reset to S0001 on first run after 6:00 AM",
    },
    importantNotes: [
      "Each model tracks its reset independently",
      "CMB-877 resetting at 7:00 AM doesn't prevent CMB-778 from resetting at 8:00 AM",
      "Only one reset per model per day",
      "Reset time is configurable in serialNoconfig collection",
      "lastReset field is preserved during normal operations",
    ],
  };
}

// Check status of all models (for admin/monitoring)
export async function checkAllModelsStatus() {
  try {
    logger.info("📊 Checking status of all model configurations...");
    const statusReport =
      await SerialNumberGeneratorService.checkAllModelsStatus();
    return statusReport;
  } catch (error) {
    logger.error("❌ Failed to check all models status:", error);
    throw error;
  }
}

// Fix model configurations (for admin maintenance)
export async function fixModelConfigurations() {
  try {
    logger.info("🔧 Fixing model configurations...");
    await SerialNumberGeneratorService.fixModelSerialConfigurations();
    logger.info("✅ Model configurations fixed successfully");
    return { success: true, message: "Model configurations fixed" };
  } catch (error) {
    logger.error("❌ Failed to fix model configurations:", error);
    throw error;
  }
}

// Example usage:
//
// For manual control/testing:
// import { checkSerialResetStatus, manualSerialReset, checkModelResetStatus } from './services/schedulerIntegration.js';
//
// // Check current status
// const status = await checkSerialResetStatus();
//
// // Force a manual reset
// const result = await manualSerialReset();
//
// // Check specific model (mainly for monitoring)
// const modelStatus = await checkModelResetStatus("CMB-877");
