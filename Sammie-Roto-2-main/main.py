# main.py
"""
Sammie Roto Web Backend - FastAPI Server.
Exposes endpoints for high-quality video masking, tracking, and matting.
"""

import os
import io
import shutil
from typing import List, Optional
from pydantic import BaseModel, Field

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Initialize FastAPI App
app = FastAPI(
    title="Sammie Roto Web Backend",
    description="Interactive Mobile Video Masking and Matting Engine API",
    version="2.3.4"
)

# Enable CORS for front-end integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure temporary upload directory exists
UPLOAD_DIR = "temp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Define schemas for requests
class PointSegmentRequest(BaseModel):
    frame_number: int = Field(..., description="The frame index to perform point segmentation on.")
    object_id: int = Field(0, description="The tracking ID for this object mask.")
    coords: List[List[int]] = Field(..., description="List of [x, y] coordinate points.")
    labels: List[int] = Field(..., description="List of positive (1) or negative (0) labels corresponding to coordinates.")

class TrackRequest(BaseModel):
    start_frame: Optional[int] = Field(None, description="Starting frame for propagation.")
    end_frame: Optional[int] = Field(None, description="Ending frame for propagation.")

class MattingRequest(BaseModel):
    combined: bool = Field(False, description="Whether to run combined matting across all objects.")


@app.get("/")
def read_root():
    return {
        "app": "Sammie Roto Web Backend",
        "status": "online",
        "endpoints": [
            "/upload-video",
            "/segment-point",
            "/track-objects",
            "/run-matting",
            "/run-removal",
            "/preview"
        ]
    }


@app.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """
    Upload a video file, decode its frames, and initialize the SAM2 predictor.
    """
    # 1. Save uploaded file to temp uploads
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    # 2. Load the video into our inference singleton
    try:
        from app_core import SammieWebKitCore
        core_instance = SammieWebKitCore.get_instance()
        metadata = core_instance.load_video(file_path)
        return JSONResponse(content=metadata)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error initializing video inference engine: {str(e)}")


@app.post("/segment-point")
async def segment_point(req: PointSegmentRequest):
    """
    Feed coordinates and labels to SAM2 on a specific frame to predict/edit object mask.
    """
    try:
        from app_core import SammieWebKitCore
        core_instance = SammieWebKitCore.get_instance()
        result = core_instance.segment_point(
            frame_number=req.frame_number,
            object_id=req.object_id,
            coords=req.coords,
            labels=req.labels
        )
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to segment point: {str(e)}")


@app.post("/track-objects")
async def track_objects(req: TrackRequest):
    """
    Propagate the active point-segmented masks across the video frames.
    """
    try:
        from app_core import SammieWebKitCore
        core_instance = SammieWebKitCore.get_instance()
        result = core_instance.track_objects(
            start_frame=req.start_frame,
            end_frame=req.end_frame
        )
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to propagate tracking: {str(e)}")


@app.post("/run-matting")
async def run_matting(req: MattingRequest):
    """
    Perform fine-grained alpha matting on the tracked objects (MatAnyone / MatAnyone2).
    """
    try:
        from app_core import SammieWebKitCore
        core_instance = SammieWebKitCore.get_instance()
        result = core_instance.run_matting(combined=req.combined)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Alpha matting failed: {str(e)}")


@app.post("/run-removal")
async def run_removal():
    """
    Perform background inpainting and object removal on the selected masks (MiniMax-Remover).
    """
    try:
        from app_core import SammieWebKitCore
        core_instance = SammieWebKitCore.get_instance()
        result = core_instance.run_removal()
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Object removal inpainting failed: {str(e)}")


@app.get("/preview")
async def preview(
    frame_number: int = Query(..., description="Frame index to preview."),
    view_mode: str = Query("Segmentation-Edit", description="View mode: Segmentation-Edit, Segmentation-BGcolor, Matting-Matte, ObjectRemoval, None")
):
    """
    Stream a real-time rendered frame preview matching the given view mode.
    """
    try:
        from app_core import SammieWebKitCore
        core_instance = SammieWebKitCore.get_instance()
        img_bytes = core_instance.get_preview_frame(frame_number, view_mode)
        return StreamingResponse(io.BytesIO(img_bytes), media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not load preview frame: {str(e)}")


@app.get("/mask")
async def get_mask(
    frame_number: int = Query(..., description="Frame index."),
    object_id: int = Query(0, description="Object ID.")
):
    """
    Retrieve the raw binary mask PNG of a specific object on a frame.
    """
    try:
        from app_core import SammieWebKitCore
        core_instance = SammieWebKitCore.get_instance()
        mask_bytes = core_instance.get_mask_frame(frame_number, object_id)
        if mask_bytes is None:
            raise HTTPException(status_code=404, detail="Mask not found for this frame/object.")
        return StreamingResponse(io.BytesIO(mask_bytes), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load mask: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=False)
