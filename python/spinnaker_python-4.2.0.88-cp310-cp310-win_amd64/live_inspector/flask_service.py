"""
Flask REST API service for Live Inspector functionality.
Provides endpoints for image inspection using FLIR cameras.
"""
import os
import sys
import json
import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
import tempfile

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core_inspector import analyze_image
from live_camera_helper import LiveCameraHelper

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()

# Global camera helper instance
camera_helper = None

def init_camera():
    """Initialize the camera helper."""
    global camera_helper
    if camera_helper is None:
        camera_helper = LiveCameraHelper()
        if not camera_helper.connect():
            app.logger.warning(f"Camera connection failed: {camera_helper.error_msg}")
    return camera_helper

def allowed_file(filename):
    """Check if file extension is allowed."""
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp', 'tiff', 'tif'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def decode_base64_image(base64_string):
    """Decode base64 string to OpenCV image."""
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64
        image_data = base64.b64decode(base64_string)
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        raise ValueError(f"Failed to decode base64 image: {str(e)}")

def encode_image_to_base64(image):
    """Encode OpenCV image to base64 string."""
    _, buffer = cv2.imencode('.png', image)
    image_base64 = base64.b64encode(buffer).decode('utf-8')
    return image_base64

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    cam = init_camera()
    return jsonify({
        'status': 'healthy',
        'camera_available': not cam.mock_mode,
        'camera_error': cam.error_msg if cam.mock_mode else None
    })

@app.route('/api/inspect', methods=['POST'])
def inspect_image():
    """
    Inspect an image against a reference using a mask.
    
    Request body (JSON):
    {
        "reference_image": "base64_encoded_image" or file path,
        "test_image": "base64_encoded_image" or file path (optional, uses live camera if not provided),
        "mask_image": "base64_encoded_image" or file path,
        "ssim_threshold": 0.70,
        "corr_threshold": 0.90,
        "use_live_camera": false,
        "return_images": false  // Whether to return heatmap/overlay as base64
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Get thresholds
        ssim_thresh = float(data.get('ssim_threshold', 0.70))
        corr_thresh = float(data.get('corr_threshold', 0.90))
        use_live_camera = data.get('use_live_camera', False)
        return_images = data.get('return_images', False)
        
        # Load reference image
        ref_input = data.get('reference_image')
        if not ref_input:
            return jsonify({'error': 'reference_image is required'}), 400
        
        if os.path.exists(ref_input):
            ref_img = cv2.imread(ref_input)
        else:
            ref_img = decode_base64_image(ref_input)
        
        if ref_img is None:
            return jsonify({'error': 'Failed to load reference image'}), 400
        
        # Load mask image
        mask_input = data.get('mask_image')
        if not mask_input:
            return jsonify({'error': 'mask_image is required'}), 400
        
        if os.path.exists(mask_input):
            mask_img = cv2.imread(mask_input, cv2.IMREAD_GRAYSCALE)
        else:
            mask_img = decode_base64_image(mask_input)
            if len(mask_img.shape) == 3:
                mask_img = cv2.cvtColor(mask_img, cv2.COLOR_BGR2GRAY)
        
        if mask_img is None:
            return jsonify({'error': 'Failed to load mask image'}), 400
        
        # Resize mask to match reference if needed
        if mask_img.shape != ref_img.shape[:2]:
            mask_img = cv2.resize(mask_img, (ref_img.shape[1], ref_img.shape[0]))
        
        # Get test image
        test_input = data.get('test_image')
        if use_live_camera or not test_input:
            # Use live camera
            cam = init_camera()
            test_img = cam.snap()
            if test_img is None:
                return jsonify({'error': 'Failed to capture image from camera'}), 500
        else:
            # Use provided test image
            if os.path.exists(test_input):
                test_img = cv2.imread(test_input)
            else:
                test_img = decode_base64_image(test_input)
            
            if test_img is None:
                return jsonify({'error': 'Failed to load test image'}), 400
        
        # Perform analysis
        result = analyze_image(ref_img, test_img, mask_img, ssim_thresh, corr_thresh)
        
        # Prepare response
        response = {
            'passed': result['passed'],
            'mae': result['mae'],
            'ssim': result['ssim'],
            'corr': result['corr'],
            'message': result.get('msg', 'OK')
        }
        
        # Optionally include images
        if return_images:
            response['heatmap'] = encode_image_to_base64(result['heatmap'])
            response['overlay'] = encode_image_to_base64(result['overlay'])
        
        return jsonify(response)
    
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        app.logger.error(f"Inspection error: {str(e)}", exc_info=True)
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/capture', methods=['POST'])
def capture_image():
    """
    Capture a single image from the live camera.
    
    Request body (JSON, optional):
    {
        "return_base64": true  // Return as base64 string
    }
    """
    try:
        data = request.get_json() or {}
        return_base64 = data.get('return_base64', False)
        
        cam = init_camera()
        img = cam.snap()
        
        if img is None:
            return jsonify({'error': 'Failed to capture image from camera'}), 500
        
        if return_base64:
            return jsonify({
                'success': True,
                'image': encode_image_to_base64(img),
                'width': img.shape[1],
                'height': img.shape[0]
            })
        else:
            # Save to temp file and return path
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.png', dir=app.config['UPLOAD_FOLDER'])
            cv2.imwrite(temp_file.name, img)
            return jsonify({
                'success': True,
                'file_path': temp_file.name,
                'width': img.shape[1],
                'height': img.shape[0]
            })
    
    except Exception as e:
        app.logger.error(f"Capture error: {str(e)}", exc_info=True)
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """
    Upload image files (reference, test, or mask).
    Returns the file path or base64 encoded image.
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
        
        # Save file
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Optionally return as base64
        return_base64 = request.form.get('return_base64', 'false').lower() == 'true'
        
        if return_base64:
            img = cv2.imread(filepath)
            if img is None:
                return jsonify({'error': 'Failed to read uploaded image'}), 400
            return jsonify({
                'success': True,
                'image': encode_image_to_base64(img),
                'file_path': filepath
            })
        else:
            return jsonify({
                'success': True,
                'file_path': filepath
            })
    
    except Exception as e:
        app.logger.error(f"Upload error: {str(e)}", exc_info=True)
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/camera/status', methods=['GET'])
def camera_status():
    """Get camera connection status."""
    cam = init_camera()
    return jsonify({
        'connected': not cam.mock_mode,
        'mock_mode': cam.mock_mode,
        'error': cam.error_msg if cam.mock_mode else None
    })

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file too large error."""
    return jsonify({'error': 'File too large. Maximum size is 16MB'}), 413

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Initialize camera on startup
    init_camera()
    
    # Run Flask app
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )

