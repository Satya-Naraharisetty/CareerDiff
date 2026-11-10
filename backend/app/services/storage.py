"""Storage service for handling resume files locally and on S3/MinIO."""

import hashlib
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()

# Local persistence storage directory for files
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "storage" / "resumes"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def compute_file_hash(content: bytes) -> str:
    """Compute SHA-256 hash for document deduplication and integrity."""
    return hashlib.sha256(content).hexdigest()


def upload_resume_document(filename: str, content: bytes) -> tuple[str, str]:
    """Store resume document and return (s3_key, file_hash).

    Stores document in managed storage directory and generates canonical S3 key.
    """
    file_hash = compute_file_hash(content)
    # Sanitize filename
    safe_filename = "".join(c for c in filename if c.isalnum() or c in "._- ")
    s3_key = f"resumes/{file_hash}_{safe_filename}"

    # Save to local storage cache
    local_path = UPLOAD_DIR / f"{file_hash}_{safe_filename}"
    local_path.write_bytes(content)

    return s3_key, file_hash


def get_resume_document(s3_key: str) -> bytes | None:
    """Retrieve stored document bytes given an S3 key."""
    basename = Path(s3_key).name
    local_path = UPLOAD_DIR / basename
    if local_path.is_file():
        return local_path.read_bytes()
    return None
