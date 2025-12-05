"""
Simple test script to test the Flask API endpoints.
Make sure the Flask service is running before executing this script.
"""
import requests
import json

BASE_URL = "http://localhost:5000"

def test_health():
    """Test the health endpoint."""
    print("=" * 50)
    print("Testing /health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_camera_status():
    """Test the camera status endpoint."""
    print("=" * 50)
    print("Testing /api/camera/status endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/api/camera/status")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_capture():
    """Test the capture endpoint."""
    print("=" * 50)
    print("Testing /api/capture endpoint...")
    try:
        response = requests.post(
            f"{BASE_URL}/api/capture",
            json={"return_base64": False}
        )
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def main():
    """Run all tests."""
    print("\n" + "=" * 50)
    print("Flask API Test Suite")
    print("=" * 50)
    print("\nMake sure the Flask service is running on http://localhost:5000")
    print("Press Enter to continue...")
    input()
    
    results = []
    
    # Test health
    results.append(("Health Check", test_health()))
    
    # Test camera status
    results.append(("Camera Status", test_camera_status()))
    
    # Test capture (optional - requires camera or mock mode)
    print("\n" + "=" * 50)
    print("Testing capture endpoint (this may fail if camera is not available)...")
    results.append(("Capture", test_capture()))
    
    # Summary
    print("\n" + "=" * 50)
    print("Test Summary:")
    print("=" * 50)
    for test_name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print("\n" + "=" * 50)

if __name__ == "__main__":
    main()

