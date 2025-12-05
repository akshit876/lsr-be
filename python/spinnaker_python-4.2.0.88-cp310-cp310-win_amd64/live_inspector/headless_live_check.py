import argparse
import json
import cv2
import sys
import os

# Ensure local imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core_inspector import analyze_image
from live_camera_helper import LiveCameraHelper

def main():
    parser = argparse.ArgumentParser(description="Headless Live Inspector")
    parser.add_argument("--ref", required=True, help="Path to Reference Image")
    parser.add_argument("--mask", required=True, help="Path to Mask Image")
    parser.add_argument("--ssim", type=float, default=0.70, help="SSIM Threshold")
    parser.add_argument("--corr", type=float, default=0.90, help="Correlation Threshold")
    parser.add_argument("--mock", action="store_true", help="Force Mock Camera")
    
    args = parser.parse_args()
    
    result = {
        "passed": False,
        "mae": 0.0,
        "ssim": 0.0,
        "corr": 0.0,
        "error": None
    }
    
    try:
        # 1. Load Files
        if not os.path.exists(args.ref):
            raise FileNotFoundError(f"Reference file not found: {args.ref}")
        if not os.path.exists(args.mask):
            raise FileNotFoundError(f"Mask file not found: {args.mask}")
            
        ref_img = cv2.imread(args.ref)
        mask_img = cv2.imread(args.mask, cv2.IMREAD_GRAYSCALE)
        
        if ref_img is None: raise ValueError("Failed to load Reference Image")
        if mask_img is None: raise ValueError("Failed to load Mask Image")
        
        # Resize mask to ref if needed
        if mask_img.shape != ref_img.shape[:2]:
            mask_img = cv2.resize(mask_img, (ref_img.shape[1], ref_img.shape[0]))

        # 2. Capture Live Frame
        cam = LiveCameraHelper()
        if args.mock:
            cam.mock_mode = True
            
        if not cam.connect():
            raise RuntimeError(f"Camera Connection Failed: {cam.error_msg}")
            
        try:
            live_frame = cam.snap()
            if live_frame is None:
                raise RuntimeError("Failed to capture image from camera")
        finally:
            cam.disconnect()

        # 3. Analyze
        analysis = analyze_image(ref_img, live_frame, mask_img, args.ssim, args.corr)
        
        result["passed"] = analysis["passed"]
        result["mae"] = analysis["mae"]
        result["ssim"] = analysis["ssim"]
        result["corr"] = analysis["corr"]
        
    except Exception as e:
        result["error"] = str(e)
        
    # 4. Output JSON
    print(json.dumps(result))

if __name__ == "__main__":
    main()
