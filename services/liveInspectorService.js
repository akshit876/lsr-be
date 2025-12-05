/**
 * Live Inspector Service - Node.js integration with Flask API
 *
 * This service provides functions to interact with the Flask-based Live Inspector API.
 * It replaces the need to spawn Python processes directly.
 */

import axios from "axios";
import fs from "fs";
import path from "path";

const FLASK_API_URL = process.env.FLASK_API_URL || "http://localhost:5000";

/**
 * Check if Flask service is healthy
 * @returns {Promise<Object>} Health status
 */
async function checkHealth() {
  try {
    const response = await axios.get(`${FLASK_API_URL}/health`);
    return response.data;
  } catch (error) {
    throw new Error(`Flask service health check failed: ${error.message}`);
  }
}

/**
 * Get camera status
 * @returns {Promise<Object>} Camera status information
 */
async function getCameraStatus() {
  try {
    const response = await axios.get(`${FLASK_API_URL}/api/camera/status`);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get camera status: ${error.message}`);
  }
}

/**
 * Capture an image from the live camera
 * @param {boolean} returnBase64 - Whether to return image as base64 string
 * @returns {Promise<Object>} Captured image data
 */
async function captureImage(returnBase64 = false) {
  try {
    const response = await axios.post(`${FLASK_API_URL}/api/capture`, {
      return_base64: returnBase64,
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to capture image: ${error.message}`);
  }
}

/**
 * Encode image file to base64
 * @param {string} imagePath - Path to image file
 * @returns {string} Base64 encoded image string
 */
function encodeImageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString("base64");
  } catch (error) {
    throw new Error(`Failed to encode image: ${error.message}`);
  }
}

/**
 * Decode base64 image and save to file
 * @param {string} base64String - Base64 encoded image
 * @param {string} outputPath - Path to save the image
 */
function decodeBase64ToImage(base64String, outputPath) {
  try {
    const imageBuffer = Buffer.from(base64String, "base64");
    fs.writeFileSync(outputPath, imageBuffer);
  } catch (error) {
    throw new Error(`Failed to decode and save image: ${error.message}`);
  }
}

/**
 * Upload an image file to Flask service
 * @param {string} imagePath - Path to image file
 * @param {boolean} returnBase64 - Whether to return base64 in response
 * @returns {Promise<Object>} Upload result
 */
async function uploadImage(imagePath, returnBase64 = false) {
  try {
    const FormData = (await import("form-data")).default;
    const formData = new FormData();
    const fileStream = fs.createReadStream(imagePath);
    const fileName = path.basename(imagePath);

    formData.append("file", fileStream, fileName);
    formData.append("return_base64", returnBase64.toString());

    const response = await axios.post(`${FLASK_API_URL}/api/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    return response.data;
  } catch (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

/**
 * Run live inspection - equivalent to Qt GUI's "SNAP CHECK" or live inspection
 *
 * This function replicates the main functionality of the Qt GUI:
 * - Takes reference image, mask image, and thresholds
 * - Optionally captures live image from camera or uses provided test image
 * - Returns inspection results (passed/failed, metrics, optional images)
 *
 * @param {Object} options - Inspection options
 * @param {string} options.referenceImage - Path to reference image OR base64 string
 * @param {string} options.maskImage - Path to mask image OR base64 string
 * @param {string} [options.testImage] - Path to test image OR base64 string (optional, uses live camera if not provided)
 * @param {boolean} [options.useLiveCamera=true] - Whether to use live camera for test image
 * @param {number} [options.ssimThreshold=0.70] - SSIM threshold (0.0 - 1.0)
 * @param {number} [options.corrThreshold=0.90] - Correlation threshold (0.0 - 1.0)
 * @param {boolean} [options.returnImages=false] - Whether to return heatmap and overlay images
 * @param {boolean} [options.imagesAsBase64=true] - If returnImages=true, return as base64 (true) or file paths (false)
 * @returns {Promise<Object>} Inspection result
 */
async function runInspection({
  referenceImage = null,
  maskImage = null,
  testImage = null,
  useLiveCamera = true,
  ssimThreshold = 0.7,
  corrThreshold = 0.9,
  returnImages = false,
  imagesAsBase64 = true,
}) {
  try {
    // Prepare request payload
    const payload = {
      ssim_threshold: ssimThreshold,
      corr_threshold: corrThreshold,
      use_live_camera: useLiveCamera && !testImage,
      return_images: returnImages,
    };

    // Add reference image if provided (otherwise Flask will use default)
    if (referenceImage) {
      if (fs.existsSync(referenceImage)) {
        payload.reference_image = encodeImageToBase64(referenceImage);
      } else {
        payload.reference_image = referenceImage; // Assume base64
      }
    }

    // Add mask image if provided (otherwise Flask will use default)
    if (maskImage) {
      if (fs.existsSync(maskImage)) {
        payload.mask_image = encodeImageToBase64(maskImage);
      } else {
        payload.mask_image = maskImage; // Assume base64
      }
    }

    // Add test image if provided and not using live camera
    if (testImage && !useLiveCamera) {
      if (fs.existsSync(testImage)) {
        payload.test_image = encodeImageToBase64(testImage);
      } else {
        payload.test_image = testImage; // Assume base64
      }
    }

    // Call Flask API
    const response = await axios.post(`${FLASK_API_URL}/api/inspect`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      // Flask returned an error response
      throw new Error(
        `Inspection failed: ${error.response.data.error || error.message}`
      );
    } else {
      throw new Error(`Inspection request failed: ${error.message}`);
    }
  }
}

/**
 * Simplified inspection function - matches the old node_integration_example.js interface
 * Uses default paths if refPath or maskPath are not provided
 *
 * @param {string} [refPath] - Absolute path to Reference Image (optional, uses default if not provided)
 * @param {string} [maskPath] - Absolute path to Mask Image (optional, uses default if not provided)
 * @param {number} ssimThresh - Minimum SSIM (0.0 - 1.0)
 * @param {number} corrThresh - Minimum Correlation (0.0 - 1.0)
 * @returns {Promise<Object>} The inspection result
 */
async function runLiveInspection(
  refPath = null,
  maskPath = null,
  ssimThresh = 0.7,
  corrThresh = 0.9
) {
  return await runInspection({
    referenceImage: refPath,
    maskImage: maskPath,
    useLiveCamera: true,
    ssimThreshold: ssimThresh,
    corrThreshold: corrThresh,
    returnImages: false,
  });
}

/**
 * Run inspection with a specific test image (not from camera)
 *
 * @param {string} refPath - Path to reference image
 * @param {string} testPath - Path to test image
 * @param {string} maskPath - Path to mask image
 * @param {number} ssimThresh - SSIM threshold
 * @param {number} corrThresh - Correlation threshold
 * @returns {Promise<Object>} Inspection result
 */
async function runInspectionWithTestImage(
  refPath,
  testPath,
  maskPath,
  ssimThresh = 0.7,
  corrThresh = 0.9
) {
  return await runInspection({
    referenceImage: refPath,
    testImage: testPath,
    maskImage: maskPath,
    useLiveCamera: false,
    ssimThreshold: ssimThresh,
    corrThreshold: corrThresh,
    returnImages: false,
  });
}

export {
  checkHealth,
  getCameraStatus,
  captureImage,
  runInspection,
  runLiveInspection,
  runInspectionWithTestImage,
  uploadImage,
  encodeImageToBase64,
  decodeBase64ToImage,
};
