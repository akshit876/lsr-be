import threading
import queue
import cv2
import numpy as np
import time

IMPORT_ERR = ""
try:
    import PySpin
    SPINNAKER_AVAILABLE = True
except ImportError as e:
    SPINNAKER_AVAILABLE = False
    IMPORT_ERR = str(e)
    print(f"PySpin Import Failed: {e}")
except Exception as e:
    SPINNAKER_AVAILABLE = False
    IMPORT_ERR = f"General: {str(e)}"
    print(f"PySpin Import Failed [Gen]: {e}")

class LiveCameraHelper:
    def __init__(self):
        self.system = None
        self.cam = None
        self.is_streaming = False
        self.stream_thread = None
        self.callback = None
        self.error_msg = ""
        self.mock_mode = not SPINNAKER_AVAILABLE
        
        if self.mock_mode:
            self.error_msg = f"Mock Mode. Reason: {IMPORT_ERR}"

    def connect(self):
        if self.mock_mode:
            return True # Always "connect" in mock mode
            
        try:
            self.system = PySpin.System.GetInstance()
            cam_list = self.system.GetCameras()
            if cam_list.GetSize() == 0:
                self.error_msg = "No Cameras Found"
                cam_list.Clear()
                self.system.ReleaseInstance()
                return False
                
            self.cam = cam_list.GetByIndex(0)
            self.cam.Init()
            return True
        except Exception as e:
            self.error_msg = str(e)
            return False

    def disconnect(self):
        self.stop_stream()
        if self.cam:
            try:
                self.cam.DeInit()
                del self.cam
            except: pass
            self.cam = None
        if self.system:
            try:
                self.system.ReleaseInstance()
            except: pass
            self.system = None

    def start_stream(self, callback):
        """
        Starts a thread that continuously calls callback(cv_image).
        """
        self.callback = callback
        self.is_streaming = True
        self.stream_thread = threading.Thread(target=self._stream_loop, daemon=True)
        self.stream_thread.start()

    def stop_stream(self):
        self.is_streaming = False
        if self.stream_thread:
            self.stream_thread.join(timeout=1.0)
            self.stream_thread = None

    def snap(self):
        """
        Returns a single frame (blocking).
        """
        if self.mock_mode:
            return self._generate_mock_frame()
            
        if not self.cam:
            return None
            
        if self.is_streaming:
            return None 
            
        try:
            self.cam.BeginAcquisition()
            img_res = self.cam.GetNextImage(1000)
            img = self._process_spinnaker_image(img_res)
            img_res.Release()
            self.cam.EndAcquisition()
            return img
        except Exception as e:
            print(f"Snap error: {e}")
            return None

    def _stream_loop(self):
        if self.mock_mode:
            self._mock_stream_loop()
            return

        try:
            # self.cam.AcquisitionMode.SetValue(PySpin.AcquisitionMode_Continuous)
            self.cam.BeginAcquisition()
            
            while self.is_streaming:
                try:
                    img_res = self.cam.GetNextImage(1000)
                    if img_res.IsIncomplete():
                        img_res.Release()
                        continue
                        
                    cv_img = self._process_spinnaker_image(img_res)
                    img_res.Release()
                    
                    if self.callback and cv_img is not None:
                        self.callback(cv_img)
                        
                except PySpin.SpinnakerException as ex:
                    print(f"Stream error: {ex}")
                    break
                    
            self.cam.EndAcquisition()
        except Exception as e:
            print(f"Acquisition error: {e}")
            self.error_msg = str(e)

    def _process_spinnaker_image(self, img_res):
        width = img_res.GetWidth()
        height = img_res.GetHeight()
        data = img_res.GetNDArray()
        
        if len(data.shape) == 2:
            return cv2.cvtColor(data, cv2.COLOR_GRAY2BGR)
        return data.copy()

    def _mock_stream_loop(self):
        # Generate noise/pattern
        while self.is_streaming:
            img = self._generate_mock_frame()
            if self.callback:
                self.callback(img)
            time.sleep(0.033) # 30 FPS

    def _generate_mock_frame(self):
        # Create a shifting gradient
        h, w = 600, 800
        t = time.time() * 2
        
        x = np.linspace(0, 1, w)
        y = np.linspace(0, 1, h)
        xv, yv = np.meshgrid(x, y)
        
        # Moving circle
        cx = 0.5 + 0.3 * np.sin(t)
        cy = 0.5 + 0.3 * np.cos(t)
        
        mask = ((xv - cx)**2 + (yv - cy)**2) < 0.1
        
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:, :, 0] = (xv * 255).astype(np.uint8)
        img[mask] = [0, 255, 0] # Green circle
        
        # Add noise
        noise = np.random.randint(0, 30, (h, w, 3), dtype=np.uint8)
        img = cv2.add(img, noise)
        
        return img
