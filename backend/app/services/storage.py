"""Storage service for persisting resume documents to managed local disk."""

import hashlib
import uuid
from pathlib import Path

# Local persistence storage directory for files
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "storage" / "resumes"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def compute_file_hash(content: bytes) -> str:
    """Compute SHA-256 hash for document deduplication and integrity."""
    return hashlib.sha256(content).hexdigest()


def upload_resume_document(filename: str, content: bytes) -> tuple[str, str]:
    """Store resume document to disk and return (storage_key, file_hash)."""
    file_hash = compute_file_hash(content)
    # Sanitize filename (keep it short; never trust client-supplied names on disk)
    safe_filename = "".join(c for c in filename if c.isalnum() or c in "._-")[-80:] or "resume"
    # A unique id per upload: two users uploading identical bytes must never share one file,
    # otherwise one user's account deletion (right to erasure) would delete the other's resume.
    object_name = f"{uuid.uuid4().hex}_{safe_filename}"
    storage_key = f"resumes/{object_name}"

    # Save to local storage
    local_path = UPLOAD_DIR / object_name
    local_path.write_bytes(content)

    return storage_key, file_hash


def get_resume_document(storage_key: str) -> bytes | None:
    """Retrieve stored document bytes given a storage key."""
    basename = Path(storage_key).name
    local_path = UPLOAD_DIR / basename
    if local_path.is_file():
        return local_path.read_bytes()
    return None


def delete_resume_document(storage_key: str) -> bool:
    """Permanently delete stored resume document from disk (GDPR Article 17 Right to Erasure)."""
    basename = Path(storage_key).name
    local_path = UPLOAD_DIR / basename
    if local_path.is_file():
        local_path.unlink()
        return True
    return False
