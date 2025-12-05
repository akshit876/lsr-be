const { spawn } = require('child_process');
const path = require('path');

/**
 * Runs the Python Live Inspector.
 * @param {string} refPath - Absolute path to Reference Image.
 * @param {string} maskPath - Absolute path to Mask Image.
 * @param {number} ssimThresh - Minimum SSIM (0.0 - 1.0).
 * @param {number} corrThresh - Minimum Correlation (0.0 - 1.0).
 * @returns {Promise<Object>} - The inspection result.
 */
function runLiveInspection(refPath, maskPath, ssimThresh = 0.70, corrThresh = 0.90) {
    return new Promise((resolve, reject) => {
        // Path to your Python executable (Use the one with dependencies installed)
        const pythonExe = 'd:\\logoDetector\\Flir\\industrial_inspection\\env\\Scripts\\python.exe';

        // Path to the headless script
        const scriptPath = path.join(__dirname, 'headless_live_check.py');

        const args = [
            scriptPath,
            '--ref', refPath,
            '--mask', maskPath,
            '--ssim', ssimThresh.toString(),
            '--corr', corrThresh.toString()
        ];

        // For testing without camera, add --mock
        // args.push('--mock'); 

        const pythonProcess = spawn(pythonExe, args);

        let dataString = '';
        let errorString = '';

        pythonProcess.stdout.on('data', (data) => {
            dataString += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorString += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Python process exited with code ${code}: ${errorString}`));
                return;
            }

            try {
                const result = JSON.parse(dataString);
                resolve(result);
            } catch (e) {
                reject(new Error(`Failed to parse JSON: ${dataString}`));
            }
        });
    });
}

// --- Example Usage ---
async function main() {
    console.log("Starting Inspection Request...");

    // REPLACE THESE WITH YOUR ACTUAL SAVED FILE PATHS
    const ref = "d:\\logoDetector\\Flir\\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\\live_inspector\\ref_example.png";
    const mask = "d:\\logoDetector\\Flir\\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\\live_inspector\\mask_example.png";

    try {
        const result = await runLiveInspection(ref, mask);
        console.log("Inspection Result:", result);

        if (result.passed) {
            console.log("✅ PRODUCT OK");
        } else {
            console.log("❌ PRODUCT DEFECTIVE");
            if (result.error) console.error("Error:", result.error);
        }
    } catch (err) {
        console.error("System Error:", err.message);
    }
}

if (require.main === module) {
    main();
}

module.exports = { runLiveInspection };
