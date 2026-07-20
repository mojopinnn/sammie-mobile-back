# gcs_helper.py
"""
Sammie GCS Manager - Handles model weights caching, user uploads, 
and processed masking output videos on Google Cloud Storage.
"""

import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

try:
    from google.cloud import storage
    GCS_SUPPORTED = True
except ImportError:
    GCS_SUPPORTED = False

BUCKET_NAME = "sg-mobile-storage"

class GCSManager:
    _client = None
    _bucket = None

    @classmethod
    def get_client(cls):
        if not GCS_SUPPORTED:
            print("[GCSManager] Google Cloud Storage library is not installed.")
            return None
            
        if cls._client is None:
            try:
                # Default credentials automatically detected on Cloud Run
                cls._client = storage.Client()
            except Exception as e:
                print(f"[GCSManager] Failed to initialize storage.Client: {e}")
                cls._client = None
        return cls._client

    @classmethod
    def get_bucket(cls):
        if not GCS_SUPPORTED:
            return None
            
        if cls._bucket is None:
            client = cls.get_client()
            if client:
                try:
                    cls._bucket = client.bucket(BUCKET_NAME)
                except Exception as e:
                    print(f"[GCSManager] Failed to get bucket {BUCKET_NAME}: {e}")
                    cls._bucket = None
        return cls._bucket

    @classmethod
    def file_exists(cls, gcs_path: str) -> bool:
        bucket = cls.get_bucket()
        if not bucket:
            return False
        try:
            # Strip leading/trailing slashes
            gcs_path = gcs_path.lstrip("/")
            blob = bucket.blob(gcs_path)
            return blob.exists()
        except Exception as e:
            print(f"[GCSManager] Error checking file existence for {gcs_path}: {e}")
            return False

    @classmethod
    def upload_file(cls, local_path: str, gcs_path: str) -> str:
        bucket = cls.get_bucket()
        if not bucket:
            print(f"[GCSManager] Bucket {BUCKET_NAME} not available. Cannot upload {local_path}")
            return ""
        try:
            gcs_path = gcs_path.lstrip("/")
            blob = bucket.blob(gcs_path)
            blob.upload_from_filename(local_path)
            print(f"[GCSManager] Successfully uploaded {local_path} to gs://{BUCKET_NAME}/{gcs_path}")
            
            # Construct standard accessible storage URL
            return f"https://storage.googleapis.com/{BUCKET_NAME}/{gcs_path}"
        except Exception as e:
            print(f"[GCSManager] Failed to upload {local_path} to gs://{BUCKET_NAME}/{gcs_path}: {e}")
            return ""

    @classmethod
    def download_file(cls, gcs_path: str, local_path: str) -> bool:
        bucket = cls.get_bucket()
        if not bucket:
            print(f"[GCSManager] Bucket {BUCKET_NAME} not available. Cannot download {gcs_path}")
            return False
        try:
            gcs_path = gcs_path.lstrip("/")
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            blob = bucket.blob(gcs_path)
            blob.download_to_filename(local_path)
            print(f"[GCSManager] Successfully downloaded gs://{BUCKET_NAME}/{gcs_path} to {local_path}")
            return True
        except Exception as e:
            print(f"[GCSManager] Failed to download {gcs_path} from GCS: {e}")
            return False

    @classmethod
    def delete_old_local_files(cls, max_age_hours: float = 24.0):
        """
        Delete local files and folders inside 'temp_uploads' and 'temp' that are older than max_age_hours.
        This keeps the Cloud Run container filesystem lean.
        """
        import shutil
        now = time.time()
        cutoff_sec = max_age_hours * 3600.0
        
        # 1. Clean 'temp_uploads' (where original videos are saved locally)
        if os.path.exists("temp_uploads"):
            print(f"[GCSManager] Scanning local 'temp_uploads' for files older than {max_age_hours} hours...")
            for filename in os.listdir("temp_uploads"):
                filepath = os.path.join("temp_uploads", filename)
                try:
                    if os.path.isfile(filepath) or os.path.islink(filepath):
                        file_mtime = os.path.getmtime(filepath)
                        if (now - file_mtime) > cutoff_sec:
                            print(f"[GCSManager] Deleting local expired video upload file: {filepath}")
                            os.remove(filepath)
                except Exception as e:
                    print(f"[GCSManager] Error deleting local file {filepath}: {e}")
 
        # 2. Clean 'temp' directory contents (where intermediate frame cache and results are stored locally)
        if os.path.exists("temp"):
            print(f"[GCSManager] Scanning local 'temp' workspace folder for items older than {max_age_hours} hours...")
            for item in os.listdir("temp"):
                item_path = os.path.join("temp", item)
                try:
                    mtime = os.path.getmtime(item_path)
                    if (now - mtime) > cutoff_sec:
                        print(f"[GCSManager] Deleting local expired workspace item: {item_path}")
                        if os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                        else:
                            os.remove(item_path)
                except Exception as e:
                    print(f"[GCSManager] Error deleting local temp item {item_path}: {e}")

    @classmethod
    def delete_old_files(cls, max_age_hours: float = 24.0):
        """
        Delete files older than max_age_hours inside upload/ and sammie/output/ folders in GCS,
        and trigger local container cleanup. Note that sammie/models/ weights are NEVER deleted.
        """
        # First, clean up the local container filesystem
        try:
            cls.delete_old_local_files(max_age_hours)
        except Exception as local_err:
            print(f"[GCSManager] Local cleanup warning: {local_err}")

        client = cls.get_client()
        bucket = cls.get_bucket()
        if not client or not bucket:
            print("[GCSManager] GCS client or bucket not available. Skipping automatic file cleanup.")
            return
 
        folders = ["upload/", "sammie/output/"]
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=max_age_hours)
        print(f"[GCSManager] Scanning GCS for expired files older than {max_age_hours} hours (cutoff: {cutoff})...")
 
        try:
            for folder in folders:
                # List blobs with folder prefix
                blobs = client.list_blobs(BUCKET_NAME, prefix=folder)
                for blob in blobs:
                    # Ignore the folder prefix itself
                    if blob.name == folder:
                        continue
                    
                    # Convert blob's updated time to timezone-aware datetime if needed
                    updated_time = blob.updated
                    if updated_time.tzinfo is None:
                        updated_time = updated_time.replace(tzinfo=timezone.utc)
                        
                    if updated_time < cutoff:
                        print(f"[GCSManager] Deleting expired file: gs://{BUCKET_NAME}/{blob.name} (updated: {blob.updated})")
                        try:
                            blob.delete()
                        except Exception as delete_err:
                            print(f"[GCSManager] Error deleting {blob.name}: {delete_err}")
        except Exception as e:
            print(f"[GCSManager] Error during automatic cleanup on GCS: {e}")
