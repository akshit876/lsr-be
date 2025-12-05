"""
Flask REST API service for Live Inspector functionality.
Provides endpoints for image inspection using FLIR cameras.
Production-ready version with proper logging, error handling, and configuration.
"""
import os
import sys
import json
import base64
import cv2
import numpy as np
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
import tempfile

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core_inspector import analyze_image
from live_camera_helper import LiveCameraHelper

# Configuration from environment variables
FLASK_HOST = os.getenv('FLASK_HOST', '0.0.0.0')
FLASK_PORT = int(os.getenv('FLASK_PORT', '5000'))
FLASK_DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()

# Default paths for reference and mask images
DEFAULT_REF_PATH = os.getenv(
    'DEFAULT_REF_PATH',
    r'D:\img\newOK\capture_0001.png'
)
DEFAULT_MASK_PATH = os.getenv(
    'DEFAULT_MASK_PATH',
    r'D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector\mask_saved.png'
)

# Normalize paths (handle both forward and backward slashes)
DEFAULT_REF_PATH = os.path.normpath(DEFAULT_REF_PATH)
DEFAULT_MASK_PATH = os.path.normpath(DEFAULT_MASK_PATH)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()

# Setup logging
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(log_dir, exist_ok=True)

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        RotatingFileHandler(
            os.path.join(log_dir, 'flask_service.log'),
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5
        ),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

# Global camera helper instance
camera_helper = None

def init_camera():
    """Initialize the camera helper."""
    global camera_helper
    if camera_helper is None:
        camera_helper = LiveCameraHelper()
        if not camera_helper.connect():
            logger.warning(f"Camera connection failed: {camera_helper.error_msg}")
        else:
            logger.info("Camera initialized successfully")
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

def load_image_safe(path_or_base64, default_path=None, description="image"):
    """Load image from path or base64, with fallback to default path."""
    try:
        # Try as file path first
        if os.path.exists(path_or_base64):
            img = cv2.imread(path_or_base64)
            if img is not None:
                logger.debug(f"Loaded {description} from file: {path_or_base64}")
                return img
        
        # Try as base64
        try:
            img = decode_base64_image(path_or_base64)
            logger.debug(f"Loaded {description} from base64")
            return img
        except:
            pass
        
        # Fallback to default path if provided
        if default_path and os.path.exists(default_path):
            logger.info(f"Using default {description} path: {default_path}")
            img = cv2.imread(default_path)
            if img is not None:
                return img
        
        raise ValueError(f"Could not load {description}")
    except Exception as e:
        logger.error(f"Error loading {description}: {str(e)}")
        raise

@app.before_request
def log_request_info():
    """Log request information."""
    logger.debug(f"Request: {request.method} {request.path}")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    try:
        cam = init_camera()
        return jsonify({
            'status': 'healthy',
            'camera_available': not cam.mock_mode,
            'camera_error': cam.error_msg if cam.mock_mode else None,
            'default_ref_path': DEFAULT_REF_PATH if os.path.exists(DEFAULT_REF_PATH) else None,
            'default_mask_path': DEFAULT_MASK_PATH if os.path.exists(DEFAULT_MASK_PATH) else None
        })
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/inspect', methods=['POST'])
def inspect_image():
    """
    Inspect an image against a reference using a mask.
    
    Request body (JSON):
    {
        "reference_image": "base64_encoded_image" or file path (optional, uses default if not provided),
        "test_image": "base64_encoded_image" or file path (optional, uses live camera if not provided),
        "mask_image": "base64_encoded_image" or file path (optional, uses default if not provided),
        "ssim_threshold": 0.70,
        "corr_threshold": 0.90,
        "use_live_camera": false,
        "return_images": false
    }
    """
    start_time = datetime.now()
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Get thresholds
        ssim_thresh = float(data.get('ssim_threshold', 0.70))
        corr_thresh = float(data.get('corr_threshold', 0.90))
        use_live_camera = data.get('use_live_camera', False)
        return_images = data.get('return_images', False)
        
        # Load reference image (use default if not provided)
        ref_input = data.get('reference_image', DEFAULT_REF_PATH)
        try:
            ref_img = load_image_safe(ref_input, DEFAULT_REF_PATH, "reference")
        except Exception as e:
            logger.error(f"Failed to load reference image: {str(e)}")
            return jsonify({'error': f'Failed to load reference image: {str(e)}'}), 400
        
        # Load mask image (use default if not provided)
        mask_input = data.get('mask_image', DEFAULT_MASK_PATH)
        try:
            mask_img = load_image_safe(mask_input, DEFAULT_MASK_PATH, "mask")
            if len(mask_img.shape) == 3:
                mask_img = cv2.cvtColor(mask_img, cv2.COLOR_BGR2GRAY)
        except Exception as e:
            logger.error(f"Failed to load mask image: {str(e)}")
            return jsonify({'error': f'Failed to load mask image: {str(e)}'}), 400
        
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
                logger.error("Failed to capture image from camera")
                return jsonify({'error': 'Failed to capture image from camera'}), 500
        else:
            # Use provided test image
            try:
                test_img = load_image_safe(test_input, None, "test")
            except Exception as e:
                logger.error(f"Failed to load test image: {str(e)}")
                return jsonify({'error': f'Failed to load test image: {str(e)}'}), 400
        
        # Perform analysis
        result = analyze_image(ref_img, test_img, mask_img, ssim_thresh, corr_thresh, preprocess=True)
        
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
        
        # Log inspection result
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"Inspection completed: {'PASS' if result['passed'] else 'FAIL'} "
                   f"(SSIM: {result['ssim']:.3f}, Corr: {result['corr']:.3f}) in {elapsed:.2f}s")
        
        return jsonify(response)
    
    except ValueError as e:
        logger.warning(f"Validation error: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Inspection error: {str(e)}", exc_info=True)
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/capture', methods=['POST'])
def capture_image():
    """
    Capture a single image from the live camera.
    
    Request body (JSON, optional):
    {
        "return_base64": true
    }
    """
    try:
        data = request.get_json() or {}
        return_base64 = data.get('return_base64', False)
        
        cam = init_camera()
        img = cam.snap()
        
        if img is None:
            logger.error("Failed to capture image from camera")
            return jsonify({'error': 'Failed to capture image from camera'}), 500
        
        logger.info("Image captured successfully")
        
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
        logger.error(f"Capture error: {str(e)}", exc_info=True)
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
        
        logger.info(f"File uploaded: {filename}")
        
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
        logger.error(f"Upload error: {str(e)}", exc_info=True)
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

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current configuration (without sensitive data)."""
    return jsonify({
        'default_ref_path': DEFAULT_REF_PATH,
        'default_mask_path': DEFAULT_MASK_PATH,
        'ref_exists': os.path.exists(DEFAULT_REF_PATH),
        'mask_exists': os.path.exists(DEFAULT_MASK_PATH),
        'max_upload_size_mb': app.config['MAX_CONTENT_LENGTH'] / (1024 * 1024)
    })

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file too large error."""
    logger.warning("Request entity too large")
    return jsonify({'error': 'File too large. Maximum size is 16MB'}), 413

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    logger.error(f"Internal server error: {str(error)}", exc_info=True)
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("Starting Flask Live Inspector Service")
    logger.info(f"Host: {FLASK_HOST}, Port: {FLASK_PORT}")
    logger.info(f"Debug Mode: {FLASK_DEBUG}")
    logger.info(f"Default Reference: {DEFAULT_REF_PATH}")
    logger.info(f"Default Mask: {DEFAULT_MASK_PATH}")
    logger.info("=" * 60)
    
    # Initialize camera on startup
    init_camera()
    
    # Run Flask app
    app.run(
        host=FLASK_HOST,
        port=FLASK_PORT,
        debug=FLASK_DEBUG,
        threaded=True
    )
