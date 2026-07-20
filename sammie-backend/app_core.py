# app_core.py
"""
SammieWebKitCore - Headless AI Inference Core for Sammie Roto Web.
Provides a unified singleton interface to control SAM2, MatAnyone, and MiniMax-Remover
without any PySide6 graphical dependencies.
"""

import os
import sys
import shutil
import glob
import cv2
import numpy as np
import torch
import warnings
from typing import Dict, Any, List, Optional
from datetime import datetime

# ==================== HEADLESS PYSIDE6 MOCKING ====================
from unittest.mock import MagicMock

class DummyProgressDialog:
    """Headless replacement for QProgressDialog"""
    def __init__(self, *args, **kwargs):
        self.val = 0
        self.label_text = ""
    def setValue(self, val):
        self.val = val
    def wasCanceled(self):
        return False
    def close(self):
        pass
    def setWindowTitle(self, title):
        pass
    def setWindowModality(self, modality):
        pass
    def setAutoClose(self, autoclose):
        pass
    def show(self):
        pass

class DummyApplication:
    """Headless replacement for QApplication"""
    @staticmethod
    def processEvents(*args, **kwargs):
        pass
    @staticmethod
    def instance(*args, **kwargs):
        return None

# Setup mock modules in sys.modules to prevent PySide6 import crashes
pyside6_mock = MagicMock()
sys.modules['PySide6'] = pyside6_mock

widgets_mock = MagicMock()
sys.modules['PySide6.QtWidgets'] = widgets_mock
pyside6_mock.QtWidgets = widgets_mock

core_mock = MagicMock()
sys.modules['PySide6.QtCore'] = core_mock
pyside6_mock.QtCore = core_mock

gui_mock = MagicMock()
sys.modules['PySide6.QtGui'] = gui_mock
pyside6_mock.QtGui = gui_mock

# Assign our dummy/mock classes to both the sub-modules and the main module properties
widgets_mock.QProgressDialog = DummyProgressDialog
widgets_mock.QApplication = DummyApplication
widgets_mock.QMessageBox = MagicMock()
widgets_mock.QDialog = MagicMock()

core_mock.Qt = MagicMock()

gui_mock.QPixmap = MagicMock()
gui_mock.QImage = MagicMock()

# ==================== HEADLESS MODEL DOWNLOADER ====================
import requests
from tqdm import tqdm
import hashlib

def headless_ensure_models(keys, parent=None, title=None) -> bool:
    """Headless model downloader that downloads required model checkpoints with md5 verification and GCS caching"""
    from sammie.model_downloader import MODEL_REGISTRY, _md5
    from gcs_helper import GCSManager
    
    if isinstance(keys, str):
        if keys == "all":
            needed_keys = list(MODEL_REGISTRY.keys())
        else:
            needed_keys = [keys]
    else:
        needed_keys = list(keys)
        
    for k in needed_keys:
        if k not in MODEL_REGISTRY:
            print(f"[Headless] Warning: Unknown model key {k}")
            continue
        spec = MODEL_REGISTRY[k]
        
        # Check local file
        local_verified = False
        if spec.already_downloaded():
            try:
                if _md5(spec.final_path) == spec.md5:
                    print(f"[Headless] Model '{k}' is verified locally and ready.")
                    local_verified = True
                else:
                    print(f"[Headless] Model '{k}' checksum mismatch locally. Re-downloading...")
            except Exception as e:
                print(f"[Headless] Local MD5 check failed for {k}, re-downloading: {e}")

        if local_verified:
            continue
            
        os.makedirs(spec.dest_dir, exist_ok=True)
        gcs_path = f"sammie/models/{spec.filename}"
        
        # Try downloading from GCS first
        from gcs_helper import BUCKET_NAME
        print(f"[Headless] Checking if model '{k}' exists on GCS at gs://{BUCKET_NAME}/{gcs_path}...")
        if GCSManager.file_exists(gcs_path):
            print(f"[Headless] Model '{k}' found on GCS. Downloading from GCS...")
            if GCSManager.download_file(gcs_path, str(spec.final_path)):
                try:
                    if _md5(spec.final_path) == spec.md5:
                        print(f"[Headless] Model '{k}' downloaded from GCS and verified successfully.")
                        continue
                    else:
                        print(f"[Headless] Model '{k}' downloaded from GCS but MD5 mismatched. Falling back to internet download...")
                        spec.final_path.unlink(missing_ok=True)
                except Exception as e:
                    print(f"[Headless] MD5 check error for GCS downloaded {k}: {e}. Falling back to internet...")
                    spec.final_path.unlink(missing_ok=True)
            else:
                print(f"[Headless] Failed to download '{k}' from GCS. Falling back to internet download...")
        else:
            print(f"[Headless] Model '{k}' not found on GCS. Downloading from internet...")
            
        # Download from internet
        print(f"[Headless] Downloading {spec.filename} from internet...")
        try:
            r = requests.get(spec.url, stream=True, timeout=30)
            r.raise_for_status()
            total_size = int(r.headers.get("content-length", 0))
            t = tqdm(total=total_size, unit="iB", unit_scale=True, desc=f"Downloading {spec.filename}")
            
            with open(spec.part_path, "wb") as f:
                for data in r.iter_content(1024 * 1024):
                    t.update(len(data))
                    f.write(data)
            t.close()
            
            if total_size != 0 and t.n != total_size:
                if spec.part_path.exists():
                    spec.part_path.unlink()
                print(f"[Headless] Download interrupted for {spec.filename}")
                return False
                
            actual_md5 = _md5(spec.part_path)
            if actual_md5 != spec.md5:
                if spec.part_path.exists():
                    spec.part_path.unlink()
                print(f"[Headless] Checksum mismatch for {spec.filename}. Expected: {spec.md5}, Got: {actual_md5}")
                return False
                
            spec.part_path.rename(spec.final_path)
            print(f"[Headless] Finished downloading {spec.filename} from internet.")
            
            # Cache the newly downloaded model to GCS for next time
            print(f"[Headless] Caching model '{k}' to GCS at gs://{BUCKET_NAME}/{gcs_path}...")
            GCSManager.upload_file(str(spec.final_path), gcs_path)
            
        except Exception as e:
            print(f"[Headless] Error downloading model {k}: {e}")
            if spec.part_path.exists():
                spec.part_path.unlink()
            return False
            
    return True

# Monkeypatch the original model downloader to run in headless environment
from sammie import model_downloader
model_downloader.ensure_models = headless_ensure_models

# ==================== MAIN CORE SINGLETON ====================
from sammie import core
from sammie.sammie import SamManager, update_image
from sammie.matting import MatAnyManager
from sammie.removal import RemovalManager
from sammie.settings_manager import get_settings_manager

class SammieWebKitCore:
    """
    Singleton AI Inference Core wrapper for the FastAPI backend.
    Manages loading videos, segmenting points, propagating masks,
    matting backgrounds, and removing objects.
    """
    _instance: Optional['SammieWebKitCore'] = None

    @classmethod
    def get_instance(cls) -> 'SammieWebKitCore':
        """Get the singleton instance"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        if hasattr(self, '_initialized') and self._initialized:
            return
            
        print("[SammieWebKitCore] Initializing Headless Inference Core...")
        self.device = core.DeviceManager.get_device()
        self.settings_mgr = get_settings_manager()
        
        # Instantiate Core Managers from Sammie
        self.sam_manager = SamManager()
        self.matting_manager = MatAnyManager()
        self.removal_manager = RemovalManager()
        self.point_manager = core.PointManager()
        
        self.current_video_path = ""
        self._initialized = True
        print("[SammieWebKitCore] Headless Inference Core ready!")

    def load_video(self, video_path: str) -> Dict[str, Any]:
        """
        Load video, decode frames, and initialize the SAM2 predictor.
        """
        print(f"[SammieWebKitCore] Loading video: {video_path}")
        
        # Sync from GCS upload folder if local file doesn't exist
        filename = os.path.basename(video_path)
        gcs_path = f"upload/{filename}"
        from gcs_helper import GCSManager
        if not os.path.exists(video_path) and GCSManager.file_exists(gcs_path):
            print(f"[SammieWebKitCore] Local video missing. Syncing from GCS: gs://sg-mobile/{gcs_path}")
            GCSManager.download_file(gcs_path, video_path)
            
        self.current_video_path = video_path
        
        # 1. Reset points and clear previous session
        self.point_manager.clear_all()
        self.sam_manager.unload_segmentation_model()
        self.matting_manager.unload_matting_model()
        self.removal_manager.unload_minimax_model()
        
        # 2. Extract video frames (headless)
        from sammie.sammie import load_video as original_load_video
        dummy_win = MagicMock()
        original_load_video(video_path, dummy_win)
        
        # 3. Create a new session
        self.settings_mgr.create_new_session(video_path)
        self.settings_mgr.session_settings.video_width = core.VideoInfo.width
        self.settings_mgr.session_settings.video_height = core.VideoInfo.height
        self.settings_mgr.session_settings.video_fps = core.VideoInfo.fps
        self.settings_mgr.session_settings.total_frames = core.VideoInfo.total_frames
        self.settings_mgr.save_session_settings()
        
        # 4. Load segmentation model and initialize predictor
        sam_model_name = self.settings_mgr.get_session_setting("sam_model", "Base")
        print(f"[SammieWebKitCore] Loading SAM2 model: {sam_model_name}")
        self.sam_manager.load_segmentation_model(sam_model_name)
        self.sam_manager.initialize_predictor()
        
        return {
            "status": "success",
            "video_path": video_path,
            "width": core.VideoInfo.width,
            "height": core.VideoInfo.height,
            "fps": core.VideoInfo.fps,
            "total_frames": core.VideoInfo.total_frames
        }

    def segment_point(self, frame_number: int, object_id: int, coords: List[List[int]], labels: List[int]) -> Dict[str, Any]:
        """
        Add segmenting points to SAM2 state and perform interactive point prediction.
        """
        if self.sam_manager.predictor is None or self.sam_manager.inference_state is None:
            raise RuntimeError("Segmentation model is not loaded. Load a video first.")
            
        print(f"[SammieWebKitCore] Point Segmentation - Frame: {frame_number}, Object: {object_id}")
        
        # Clear existing points for this object on this frame if new ones are sent
        # We replace the points in the local PointManager
        self.point_manager.clear_frame(frame_number)
        
        # Convert coords/labels to point structures and add them
        for coord, label in zip(coords, labels):
            positive = (label == 1)
            self.point_manager.add_point(frame_number, object_id, positive, int(coord[0]), int(coord[1]))
            
        # Segment image using SAM2 predictor
        input_points = np.array(coords, dtype=np.float32)
        input_labels = np.array(labels, dtype=np.int32)
        
        self.sam_manager.segment_image(
            frame_number=frame_number,
            object_id=object_id,
            input_points=input_points,
            input_labels=input_labels
        )
        
        return {
            "status": "success",
            "frame_number": frame_number,
            "object_id": object_id,
            "points_count": len(coords)
        }

    def track_objects(self, start_frame: int = None, end_frame: int = None) -> Dict[str, Any]:
        """
        Propagate tracked points/masks forward (and optionally backward) over the range.
        """
        if self.sam_manager.predictor is None or self.sam_manager.inference_state is None:
            raise RuntimeError("Segmentation model is not loaded. Load a video first.")
            
        # Synchronize in/out points in settings
        if start_frame is not None:
            self.settings_mgr.set_session_setting("in_point", start_frame)
        if end_frame is not None:
            self.settings_mgr.set_session_setting("out_point", end_frame)
        self.settings_mgr.save_session_settings()
        
        print(f"[SammieWebKitCore] Tracking Objects across frames...")
        dummy_win = MagicMock()
        success = self.sam_manager.track_objects(dummy_win)
        
        return {
            "status": "success" if success == 1 else "failed",
            "propagated": self.sam_manager.propagated
        }

    def compile_and_upload_video(self, view_mode: str) -> str:
        """
        Compile all frames of the current video rendered with view_mode into an MP4 file,
        upload it to GCS, and return the GCS URL.
        """
        from sammie.core import VideoInfo
        import cv2
        import uuid
        from gcs_helper import GCSManager
        
        total_frames = VideoInfo.total_frames
        if total_frames <= 0:
            print("[SammieWebKitCore] No frames to compile.")
            return ""
            
        print(f"[SammieWebKitCore] Compiling video for mode '{view_mode}' with {total_frames} frames...")
        
        # Define local output path
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        local_filename = f"result_{view_mode}_{timestamp}_{uuid.uuid4().hex[:6]}.mp4"
        local_path = os.path.join("temp_uploads", local_filename)
        os.makedirs("temp_uploads", exist_ok=True)
        
        # Get video properties
        width = VideoInfo.width
        height = VideoInfo.height
        fps = VideoInfo.fps if VideoInfo.fps > 0 else 24.0
        
        # Setup OpenCV video writer with standard mp4v codec
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(local_path, fourcc, fps, (width, height))
        
        try:
            view_options = {
                "view_mode": view_mode,
                "show_masks": True,
                "show_outlines": True,
                "antialias": True,
                "show_removal_mask": False,
                "bgcolor": (0, 255, 0)
            }
            points = self.point_manager.get_all_points()
            
            from sammie.sammie import update_image
            
            for f in range(total_frames):
                frame_rgb = update_image(
                    slider_value=f,
                    view_options=view_options,
                    points=points,
                    return_numpy=True
                )
                if frame_rgb is None:
                    # Fallback to loading base frame
                    from sammie.core import load_base_frame
                    frame_rgb = load_base_frame(f)
                    
                if frame_rgb is not None:
                    # Convert to BGR for OpenCV
                    frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
                    writer.write(frame_bgr)
                else:
                    # Write blank/empty frame if load failed
                    empty_frame = np.zeros((height, width, 3), dtype=np.uint8)
                    writer.write(empty_frame)
                    
        finally:
            writer.release()
            
        # Upload compiled video to GCS output path
        gcs_filename = f"sammie/output/{local_filename}"
        print(f"[SammieWebKitCore] Uploading compiled video to GCS: gs://sg-mobile/{gcs_filename}")
        gcs_url = GCSManager.upload_file(local_path, gcs_filename)
        
        # Clean up local file after upload
        try:
            if os.path.exists(local_path):
                os.remove(local_path)
        except Exception as e:
            print(f"[SammieWebKitCore] Error removing temp compiled video: {e}")
            
        return gcs_url

    def run_matting(self, combined: bool = False) -> Dict[str, Any]:
        """
        Perform high-quality alpha matting using MatAnyone/MatAnyone2.
        """
        # Load MatAnyone model if not loaded
        if self.matting_manager.processor is None:
            print("[SammieWebKitCore] Loading MatAnyone model...")
            self.matting_manager.load_matting_model()
            
        points_list = self.point_manager.get_all_points()
        if not points_list:
            raise RuntimeError("No segmentation points defined. Segment at least one frame first.")
            
        print("[SammieWebKitCore] Running MatAnyone propagation...")
        dummy_win = MagicMock()
        success = self.matting_manager.run_matting(
            points_list=points_list,
            parent_window=dummy_win,
            combined=combined
        )
        
        gcs_url = ""
        if success == 1:
            # Compile a video composited over a solid green background
            try:
                gcs_url = self.compile_and_upload_video("Matting-BGcolor")
            except Exception as e:
                print(f"[SammieWebKitCore] Error compiling matting result video: {e}")
        
        return {
            "status": "success" if success == 1 else "failed",
            "matted": self.matting_manager.propagated,
            "gcs_url": gcs_url
        }

    def run_removal(self) -> Dict[str, Any]:
        """
        Perform background object removal using MiniMax-Remover.
        """
        points_list = self.point_manager.get_all_points()
        if not points_list:
            raise RuntimeError("No segmentation points defined. Segment at least one frame first.")
            
        print("[SammieWebKitCore] Running MiniMax-Remover object removal...")
        dummy_win = MagicMock()
        success = self.removal_manager.run_object_removal_minimax(
            points=points_list,
            parent_window=dummy_win
        )
        
        gcs_url = ""
        if success == 1:
            try:
                gcs_url = self.compile_and_upload_video("ObjectRemoval")
            except Exception as e:
                print(f"[SammieWebKitCore] Error compiling removal result video: {e}")
                
        return {
            "status": "success" if success == 1 else "failed",
            "gcs_url": gcs_url
        }

    def get_preview_frame(self, frame_number: int, view_mode: str = "Segmentation-Edit") -> bytes:
        """
        Return the JPEG encoded frame based on view mode (e.g. Segmentation-Edit, Segmentation-BGcolor, Matting-Matte).
        """
        view_options = {
            "view_mode": view_mode,
            "show_masks": True,
            "show_outlines": True,
            "antialias": True,
            "show_removal_mask": True,
            "bgcolor": (0, 255, 0)
        }
        
        points = self.point_manager.get_all_points()
        
        # Render the frame image
        frame_rgb = update_image(
            slider_value=frame_number,
            view_options=view_options,
            points=points,
            return_numpy=True
        )
        
        if frame_rgb is None:
            # Fallback to base frame
            frame_rgb = core.load_base_frame(frame_number)
            
        if frame_rgb is None:
            raise RuntimeError(f"Could not load or render preview for frame {frame_number}")
            
        # Convert RGB to BGR for opencv encoding
        frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
        _, buffer = cv2.imencode('.jpg', frame_bgr)
        return buffer.tobytes()

    def get_mask_frame(self, frame_number: int, object_id: int) -> Optional[bytes]:
        """
        Get the raw binary mask of a specific object on a frame.
        """
        mask_filename = os.path.join(core.mask_dir, f"{frame_number:05d}", f"{object_id}.png")
        if os.path.exists(mask_filename):
            with open(mask_filename, "rb") as f:
                return f.read()
        return None
