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

BUCKET_NAME = "sg-mobile"

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
    def delete_old_files(cls, max_age_hours: float = 24.0):
        """
        Delete files older than max_age_hours inside upload/ and sammie/output/ folders in GCS.
        """
        client = cls.get_client()
        bucket = cls.get_bucket()
        if not client or not bucket:
            print("[GCSManager] GCS client or bucket not available. Skipping automatic file cleanup.")
            return

        folders = ["upload/", "sammie/output/"]
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=max_age_hours)
        print(f"[GCSManager] Scanning for expired files older than {max_age_hours} hours (cutoff: {cutoff})...")

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
