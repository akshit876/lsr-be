import sys
import numpy as np
import cv2
import threading
import time
import json
import os
from datetime import datetime
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                             QToolBar, QPushButton, QSlider, QLabel, QFileDialog, QSplitter, 
                             QTextEdit, QFrame, QRadioButton, QButtonGroup, QGraphicsView, QGraphicsScene, 
                             QSpinBox, QDoubleSpinBox, QSizePolicy, QGroupBox, QGridLayout)
from PyQt6.QtCore import Qt, pyqtSignal, QPointF, QObject, pyqtSlot
from PyQt6.QtGui import QImage, QPixmap, QPainter, QPen, QColor, QCursor, QFont, QIcon

# Imports from local dir
from core_inspector import analyze_image
from live_camera_helper import LiveCameraHelper

class WorkerSignals(QObject):
    frame_received = pyqtSignal(np.ndarray)
    result_ready = pyqtSignal(dict)

class PaintableView(QGraphicsView):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        self.setDragMode(QGraphicsView.DragMode.NoDrag)
        self.scene_obj = QGraphicsScene(self)
        self.setScene(self.scene_obj)
        
        self.image_item = None
        self.mask_item = None
        self.brush_size = 20
        self.painting = False
        self.last_point = None
        
        self.qimg_mask = None 
        
        self.setMouseTracking(True)
        self.cursor_visible = False
        self.cursor_pos = QPointF(0, 0)
        self.scale_factor = 1.0
        
        # Performance
        self.setViewportUpdateMode(QGraphicsView.ViewportUpdateMode.FullViewportUpdate) 

    def set_image(self, cv_img):
        h, w = cv_img.shape[:2]
        rgb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
        qimg = QImage(rgb.data, w, h, 3*w, QImage.Format.Format_RGB888)
        pixmap = QPixmap.fromImage(qimg)
        
        self.scene_obj.clear()
        self.image_item = self.scene_obj.addPixmap(pixmap)
        
        # Init Mask Layer transparent
        self.qimg_mask = QImage(w, h, QImage.Format.Format_ARGB32)
        self.qimg_mask.fill(QColor(0, 0, 0, 0))
        
        self.mask_item = self.scene_obj.addPixmap(QPixmap.fromImage(self.qimg_mask))
        self.mask_item.setZValue(1)
        
        self.fitInView(self.image_item, Qt.AspectRatioMode.KeepAspectRatio)

    def drawForeground(self, painter, rect):
        if self.cursor_visible:
            painter.setPen(QPen(QColor(0, 255, 255), 2)) # Cyan cursor
            painter.setBrush(Qt.BrushStyle.NoBrush)
            r = self.brush_size / 2
            painter.drawEllipse(self.cursor_pos, r, r)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            if self.image_item:
                self.painting = True
                self.last_point = self.mapToScene(event.position().toPoint())
                self.paint_at(self.last_point)
        elif event.button() == Qt.MouseButton.MiddleButton:
            self.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
            super().mousePressEvent(event)
        else:
            super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        self.cursor_pos = self.mapToScene(event.position().toPoint())
        self.scene_obj.update()
        if self.painting:
            curr_point = self.mapToScene(event.position().toPoint())
            self.paint_stroke(self.last_point, curr_point)
            self.last_point = curr_point
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.painting = False
        elif event.button() == Qt.MouseButton.MiddleButton:
            self.setDragMode(QGraphicsView.DragMode.NoDrag)
            super().mouseReleaseEvent(event)
        else:
            super().mouseReleaseEvent(event)

    def enterEvent(self, event):
        self.cursor_visible = True
        self.viewport().setCursor(Qt.CursorShape.BlankCursor)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.cursor_visible = False
        self.viewport().setCursor(Qt.CursorShape.ArrowCursor)
        self.scene_obj.update()
        super().leaveEvent(event)

    def wheelEvent(self, event):
        zoom_in = event.angleDelta().y() > 0
        factor = 1.15 if zoom_in else 1 / 1.15
        self.scale(factor, factor)

    def paint_at(self, pos):
        self.paint_stroke(pos, pos)

    def paint_stroke(self, p1, p2):
        if self.qimg_mask is None: return
        painter = QPainter(self.qimg_mask)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        pen = QPen(QColor(255, 0, 0, 150))
        pen.setWidth(self.brush_size)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        painter.setPen(pen)
        painter.drawLine(p1, p2)
        painter.end()
        self.mask_item.setPixmap(QPixmap.fromImage(self.qimg_mask))

    def get_mask_cv(self):
        if self.qimg_mask is None: return None
        qimg = self.qimg_mask.convertToFormat(QImage.Format.Format_Grayscale8)
        w, h = qimg.width(), qimg.height()
        ptr = qimg.bits()
        ptr.setsize(h * w)
        arr = np.array(ptr).reshape(h, w)
        return arr.copy()
        
    def set_mask_cv(self, mask):
        if self.qimg_mask is None: return
        bgra = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGRA)
        bgra[:, :, 0] = 0
        bgra[:, :, 1] = 0
        bgra[:, :, 2] = 255
        bgra[:, :, 3] = (mask > 0).astype(np.uint8) * 150
        h, w, ch = bgra.shape
        qt_img = QImage(bgra.data, w, h, ch*w, QImage.Format.Format_ARGB32)
        self.qimg_mask = qt_img.copy()
        self.mask_item.setPixmap(QPixmap.fromImage(self.qimg_mask))


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Live FLIR Inspector Pro")
        self.resize(1800, 1000)
        
        # Modern Dark Theme
        self.setStyleSheet("""
            QMainWindow { background-color: #1e1e2e; }
            QWidget { font-family: 'Segoe UI', sans-serif; font-size: 14px; color: #cdd6f4; }
            
            QToolBar { background-color: #313244; border-bottom: 2px solid #585b70; spacing: 15px; padding: 10px; }
            QToolBar QLabel { font-weight: bold; }
            
            QPushButton { 
                background-color: #45475a; 
                color: #cdd6f4; 
                border: 1px solid #585b70; 
                padding: 10px 15px; 
                border-radius: 6px; 
                font-weight: 600;
            }
            QPushButton:hover { background-color: #585b70; border-color: #89b4fa; }
            QPushButton:pressed { background-color: #313244; }
            
            QPushButton#ActionBtn { background-color: #89b4fa; color: #1e1e2e; border: none; }
            QPushButton#ActionBtn:hover { background-color: #b4befe; }
            
            QPushButton#CriticalBtn { background-color: #f38ba8; color: #1e1e2e; border: none; }
            
            QSpinBox, QDoubleSpinBox { 
                background-color: #313244; 
                color: #cdd6f4; 
                border: 1px solid #585b70; 
                padding: 5px; 
                border-radius: 4px; 
            }
            
            QSlider::groove:horizontal { border: 1px solid #585b70; height: 8px; background: #313244; margin: 2px 0; border-radius: 4px; }
            QSlider::handle:horizontal { background: #89b4fa; border: 1px solid #89b4fa; width: 18px; margin: -2px 0; border-radius: 9px; }
            
            QGroupBox { border: 1px solid #585b70; border-radius: 6px; margin-top: 10px; font-weight: bold; }
            QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 5px; color: #89b4fa; }
            
            QTextEdit { background-color: #11111b; color: #a6adc8; border: 1px solid #585b70; border-radius: 4px; font-family: 'Consolas', monospace; }
        """)
        
        self.cam = LiveCameraHelper()
        self.signals = WorkerSignals()
        self.signals.frame_received.connect(self.on_frame_received)
        self.signals.result_ready.connect(self.on_result_ready)
        
        self.ref_img = None
        self.cached_mask = None
        self.is_live = False
        self.processing_busy = False # Drop frames if processing slow
        self.last_frame = None
        self.last_process_time = 0
        self.last_test_frame = None  # Store last test frame for saving on failure
        
        # Debug folder for saving results
        self.debug_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'debug')
        os.makedirs(self.debug_folder, exist_ok=True)
        
        self.setup_ui()
        
        # Auto-connect
        self.root_timer = threading.Timer(0.1, self.connect_camera)
        self.root_timer.start()
        
    def setup_ui(self):
        main_layout = QVBoxLayout()
        widget = QWidget()
        widget.setLayout(main_layout)
        self.setCentralWidget(widget)
        
        # --- TOP CONTROL BAR ---
        top_bar = QHBoxLayout()
        top_bar.setContentsMargins(10, 10, 10, 10)
        
        # 1. Camera Section
        grp_cam = QGroupBox("Camera Stream")
        cam_layout = QHBoxLayout()
        
        self.btn_live = QPushButton("▶ START LIVE")
        self.btn_live.setObjectName("ActionBtn")
        self.btn_live.clicked.connect(self.toggle_live)
        cam_layout.addWidget(self.btn_live)
        
        self.btn_single = QPushButton("📷 SNAP CHECK")
        self.btn_single.clicked.connect(self.run_single_inspection)
        cam_layout.addWidget(self.btn_single)
        
        cam_layout.addWidget(QLabel("Freq:"))
        self.spin_interval = QSpinBox()
        self.spin_interval.setRange(0, 5000)
        self.spin_interval.setSingleStep(100)
        self.spin_interval.setValue(100)
        self.spin_interval.setSuffix(" ms")
        self.spin_interval.setFixedWidth(100)
        cam_layout.addWidget(self.spin_interval)
        
        grp_cam.setLayout(cam_layout)
        top_bar.addWidget(grp_cam)
        
        # 2. Thresholds Section
        grp_thresh = QGroupBox("Pass Criteria")
        thresh_layout = QHBoxLayout()
        
        thresh_layout.addWidget(QLabel("Min SSIM:"))
        self.spin_ssim = QDoubleSpinBox()
        self.spin_ssim.setRange(0.0, 1.0)
        self.spin_ssim.setSingleStep(0.01)
        self.spin_ssim.setValue(0.70) # Lower default based on feedback
        self.spin_ssim.setDecimals(2)
        thresh_layout.addWidget(self.spin_ssim)
        
        thresh_layout.addWidget(QLabel("Min Corr:"))
        self.spin_corr = QDoubleSpinBox()
        self.spin_corr.setRange(0.0, 1.0)
        self.spin_corr.setSingleStep(0.01)
        self.spin_corr.setValue(0.90)
        thresh_layout.addWidget(self.spin_corr)
        
        grp_thresh.setLayout(thresh_layout)
        top_bar.addWidget(grp_thresh)
        
        # 3. Setup Section
        grp_setup = QGroupBox("Setup")
        setup_layout = QHBoxLayout()
        
        self.btn_snap_ref = QPushButton("SET REF")
        self.btn_snap_ref.setToolTip("Set current View as Reference")
        self.btn_snap_ref.clicked.connect(self.snap_reference)
        setup_layout.addWidget(self.btn_snap_ref)
        
        btn_mask_ops = QPushButton("Mask...")
        # Simple menu for save/load to save space? Nah, buttons for now
        btn_save = QPushButton("Save Mask")
        btn_save.clicked.connect(self.save_mask)
        btn_load = QPushButton("Load Mask")
        btn_load.clicked.connect(self.load_mask)
        btn_clear = QPushButton("Clear")
        btn_clear.clicked.connect(self.clear_mask)
        
        setup_layout.addWidget(btn_save)
        setup_layout.addWidget(btn_load)
        setup_layout.addWidget(btn_clear)
        
        grp_setup.setLayout(setup_layout)
        top_bar.addWidget(grp_setup)
        
        # 4. Brush
        grp_tools = QGroupBox("Tools")
        tool_layout = QHBoxLayout()
        tool_layout.addWidget(QLabel("Size:"))
        self.slider = QSlider(Qt.Orientation.Horizontal)
        self.slider.setRange(5, 150)
        self.slider.setValue(20)
        self.slider.setFixedWidth(120)
        self.slider.valueChanged.connect(lambda v: setattr(self.view, 'brush_size', v))
        tool_layout.addWidget(self.slider)
        grp_tools.setLayout(tool_layout)
        top_bar.addWidget(grp_tools)
        
        top_bar.addStretch()
        main_layout.addLayout(top_bar)
        
        # --- MAIN SPLIT ---
        splitter = QSplitter(Qt.Orientation.Horizontal)
        main_layout.addWidget(splitter, stretch=1)
        
        # Left: Editor
        self.view = PaintableView()
        splitter.addWidget(self.view)
        
        # Right: Results
        right_panel = QFrame()
        right_panel.setStyleSheet("background-color: #181825;")
        r_layout = QVBoxLayout(right_panel)
        r_layout.setContentsMargins(10,10,10,10)
        
        # Header
        h_ctrl = QHBoxLayout()
        lbl_res = QLabel("LIVE ANALYSIS RESULT")
        lbl_res.setStyleSheet("font-size: 16px; font-weight: bold; color: #89b4fa;")
        h_ctrl.addWidget(lbl_res)
        h_ctrl.addStretch()
        
        self.btn_grp = QButtonGroup()
        self.rb_all = QRadioButton("Data Overlay")
        self.rb_all.setChecked(True)
        self.rb_heat = QRadioButton("Diff Heatmap")
        
        h_ctrl.addWidget(self.rb_all)
        h_ctrl.addWidget(self.rb_heat)
        self.btn_grp.addButton(self.rb_all)
        self.btn_grp.addButton(self.rb_heat)
        r_layout.addLayout(h_ctrl)
        
        # View
        self.res_scene = QGraphicsScene()
        self.res_view = QGraphicsView(self.res_scene)
        self.res_view.setStyleSheet("border: 1px solid #585b70; background-color: #000;")
        r_layout.addWidget(self.res_view, stretch=3)
        
        # Log
        r_layout.addWidget(QLabel("Inspection Log:"))
        self.log_box = QTextEdit()
        r_layout.addWidget(self.log_box, stretch=1)
        
        splitter.addWidget(right_panel)
        splitter.setSizes([900, 700])

    def log(self, msg):
        self.log_box.append(msg)
        c = self.log_box.textCursor()
        c.movePosition(c.MoveOperation.End)
        self.log_box.setTextCursor(c)

    def connect_camera(self):
        if self.cam.connect():
            msg = "Backend Ready: PySpin"
            if self.cam.mock_mode:
                msg = self.cam.error_msg if self.cam.error_msg else "Backend Ready: Mock (Unknown)"
            self.log(msg)
        else:
            self.log(f"Backend Error: {self.cam.error_msg}")

    def toggle_live(self):
        if not self.is_live:
            # Start
            self.cached_mask = self.view.get_mask_cv()
            if self.cached_mask is not None and np.sum(self.cached_mask) == 0:
                self.cached_mask = None # Ignore empty
            
            self.cam.start_stream(self.stream_callback)
            self.is_live = True
            
            self.btn_live.setText("⏹ STOP LIVE")
            self.btn_live.setObjectName("CriticalBtn")
            self.btn_live.setStyleSheet("background-color: #f38ba8; color: #1e1e2e; border: none;") # Force update style
            
            self.log("Live Stream Started.")
            self.last_process_time = 0
        else:
            # Stop
            self.cam.stop_stream()
            self.is_live = False
            
            self.btn_live.setText("▶ START LIVE")
            self.btn_live.setObjectName("ActionBtn")
            self.btn_live.setStyleSheet("background-color: #89b4fa; color: #1e1e2e; border: none;")
            
            self.log("Live Stream Stopped.")

    def stream_callback(self, frame):
        self.signals.frame_received.emit(frame)

    @pyqtSlot(np.ndarray)
    def on_frame_received(self, frame):
        now = time.time()
        interval = self.spin_interval.value() / 1000.0
        self.last_frame = frame
        
        if self.ref_img is not None and self.cached_mask is not None:
             if not self.processing_busy and (now - self.last_process_time >= interval):
                 self.processing_busy = True
                 self.last_process_time = now
                 
                 ssim_t = self.spin_ssim.value()
                 corr_t = self.spin_corr.value()
                 
                 threading.Thread(target=self.run_analysis_async, args=(frame, ssim_t, corr_t)).start()
             else:
                 # Just show frame raw if interval skipping
                 # Note: This causes flicker between overlay and raw if interval is large.
                 # If we want pure overlay, we should hold last result overlay?
                 # No, user requested "Test on feed". 
                 # Maybe we skip updating this view if we want to hold the result?
                 # But then it's not live video.
                 # The requested behavior implies seeing the moving part.
                 # So defaulting to raw frame is correct for "between inspections".
                 self.show_result_frame(frame)
        else:
            self.show_result_frame(frame)

    def run_single_inspection(self):
        # 1. Update mask cache
        self.cached_mask = self.view.get_mask_cv()
        if self.cached_mask is None or np.sum(self.cached_mask) == 0:
            self.log("Error: No Mask defined.")
            return

        # 2. Get Frame
        frame = None
        if self.is_live and self.last_frame is not None:
             frame = self.last_frame
        else:
             frame = self.cam.snap()
        
        if frame is None:
            self.log("Error: Could not get frame.")
            return
            
        # 3. Analyze
        if self.ref_img is None:
            self.log("Error: No Reference Image.")
            return
            
        self.log("Running Single Inspection...")
        ssim_t = self.spin_ssim.value()
        corr_t = self.spin_corr.value()
        res = analyze_image(self.ref_img, frame, self.cached_mask, ssim_t, corr_t)
        # Store test frame reference for saving
        res['test_frame'] = frame
        self.on_result_ready(res) 

    def run_analysis_async(self, test_frame, ssim_t, corr_t):
        # Store test frame for potential saving on failure
        self.last_test_frame = test_frame.copy()
        res = analyze_image(self.ref_img, test_frame, self.cached_mask, ssim_t, corr_t)
        # Store test frame reference in result for saving
        res['test_frame'] = test_frame
        self.signals.result_ready.emit(res)

    @pyqtSlot(dict)
    def on_result_ready(self, res):
        self.processing_busy = False
        
        status = "PASS" if res['passed'] else "FAIL"
        color = "#a6e3a1" if res['passed'] else "#f38ba8" # Pastel Green/Red
        
        msg = f"<span style='color:{color}'><b>[{status}]</b> MAE:{res['mae']:.1f} SSIM:{res['ssim']:.3f} Corr:{res['corr']:.3f}</span>"
        self.log_box.append(msg)
        
        # Save inspection result
        self.save_inspection_result(res)
        
        # If failed, save images for debugging
        if not res['passed']:
            self.save_failure_images(res)
        
        if self.rb_heat.isChecked():
            self.show_result_frame(res['heatmap'])
        else:
            self.show_result_frame(res['overlay'])

    def show_result_frame(self, cv_img):
        h, w = cv_img.shape[:2]
        rgb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
        qimg = QImage(rgb.data, w, h, 3*w, QImage.Format.Format_RGB888)
        pix = QPixmap.fromImage(qimg)
        self.res_scene.clear()
        self.res_scene.addPixmap(pix)
        self.res_view.fitInView(self.res_scene.itemsBoundingRect(), Qt.AspectRatioMode.KeepAspectRatio)

    # --- Actions ---
    def snap_reference(self):
        was_live = self.is_live
        if was_live: self.toggle_live() # Pause
        
        # Grab fresh frame
        frame = self.cam.snap()
        if frame is not None:
            self.ref_img = frame
            self.view.set_image(frame)
            self.log("✅ Reference Captured.")
        else:
            self.log("❌ Failed to capture reference.")
            
        if was_live: self.toggle_live() # Resume

    def save_mask(self):
        mask = self.view.get_mask_cv()
        if mask is None: return
        path, _ = QFileDialog.getSaveFileName(self, "Save PNG", "", "PNG Files (*.png)")
        if path:
            cv2.imwrite(path, mask)
            self.log(f"Mask saved: {path}")

    def load_mask(self):
        path, _ = QFileDialog.getOpenFileName(self, "Load PNG", "", "PNG Files (*.png)")
        if path:
            mask = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
            if self.ref_img is not None:
                mask = cv2.resize(mask, (self.ref_img.shape[1], self.ref_img.shape[0]))
            self.view.set_mask_cv(mask)
            self.cached_mask = mask
            self.log("Mask Loaded.")

    def clear_mask(self):
        if self.ref_img is not None:
            h, w = self.ref_img.shape[:2]
            self.view.set_mask_cv(np.zeros((h,w), dtype=np.uint8))
            self.cached_mask = None

    def save_inspection_result(self, res):
        """Save inspection result as JSON file."""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds
            filename = f"inspection_{timestamp}.json"
            filepath = os.path.join(self.debug_folder, filename)
            
            # Prepare result data (remove test_frame if present, it's too large for JSON)
            result_data = {
                'timestamp': datetime.now().isoformat(),
                'passed': res['passed'],
                'mae': float(res['mae']),
                'ssim': float(res['ssim']),
                'corr': float(res['corr']),
                'message': res.get('msg', 'OK'),
                'ssim_threshold': float(self.spin_ssim.value()),
                'corr_threshold': float(self.spin_corr.value())
            }
            
            with open(filepath, 'w') as f:
                json.dump(result_data, f, indent=2)
            
            self.log(f"Result saved: {filename}")
        except Exception as e:
            self.log(f"Error saving result: {str(e)}")

    def save_failure_images(self, res):
        """Save test image and heatmap when inspection fails."""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            base_name = f"failure_{timestamp}"
            
            # Save test image (captured frame)
            test_frame = res.get('test_frame', self.last_test_frame)
            if test_frame is not None:
                test_image_path = os.path.join(self.debug_folder, f"{base_name}_test.png")
                cv2.imwrite(test_image_path, test_frame)
                self.log(f"Test image saved: {base_name}_test.png")
            
            # Save heatmap
            if 'heatmap' in res and res['heatmap'] is not None:
                heatmap_path = os.path.join(self.debug_folder, f"{base_name}_heatmap.png")
                cv2.imwrite(heatmap_path, res['heatmap'])
                self.log(f"Heatmap saved: {base_name}_heatmap.png")
            
            # Save overlay as well
            if 'overlay' in res and res['overlay'] is not None:
                overlay_path = os.path.join(self.debug_folder, f"{base_name}_overlay.png")
                cv2.imwrite(overlay_path, res['overlay'])
                self.log(f"Overlay saved: {base_name}_overlay.png")
                
        except Exception as e:
            self.log(f"Error saving failure images: {str(e)}")

    def closeEvent(self, event):
        if self.is_live: self.cam.stop_stream()
        self.cam.disconnect()
        event.accept()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    win = MainWindow()
    win.show()
    sys.exit(app.exec())
