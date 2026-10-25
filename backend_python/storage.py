"""
VersionVault - Content-Addressable Storage (CAS) with SHA-256 integrity verification.
"""

import os
import hashlib
import shutil
from pathlib import Path
from typing import Tuple, BinaryIO


class StorageAdapter:
    """
    Content-Addressable Storage (CAS) engine.
    Blobs are addressed purely by their cryptographic SHA-256 hash.
    Provides automatic deduplication and bitrot/tamper verification.
    """

    def __init__(self, base_dir: str = ".vault_storage/blobs"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def compute_sha256(self, file_obj: BinaryIO) -> Tuple[str, int]:
        """Compute SHA-256 and size in bytes without loading entire large file in memory."""
        hasher = hashlib.sha256()
        total_size = 0
        file_obj.seek(0)
        while chunk := file_obj.read(64 * 1024):
            hasher.update(chunk)
            total_size += len(chunk)
        file_obj.seek(0)
        return hasher.hexdigest(), total_size

    def save_blob(self, file_obj: BinaryIO) -> Tuple[str, str, int, bool]:
        """
        Saves file to CAS. Returns (sha256_hash, relative_path, size_bytes, is_deduplicated).
        If file with same SHA-256 already exists, reuses existing blob safely.
        """
        sha256, size = self.compute_sha256(file_obj)
        # 2-level directory sharding (e.g., ab/cd/abcdef...)
        sub_dir = self.base_dir / sha256[:2] / sha256[2:4]
        sub_dir.mkdir(parents=True, exist_ok=True)
        target_path = sub_dir / sha256

        is_dedup = target_path.exists()
        if not is_dedup:
            temp_path = sub_dir / f"tmp_{os.urandom(8).hex()}"
            with open(temp_path, "wb") as f_out:
                file_obj.seek(0)
                shutil.copyfileobj(file_obj, f_out)
            os.replace(temp_path, target_path)

        relative_path = str(target_path.relative_to(self.base_dir.parent))
        return sha256, relative_path, size, is_dedup

    def verify_integrity(self, relative_path: str, expected_sha256: str) -> Tuple[bool, str]:
        """Verify on-disk file bytes against cryptographic checksum."""
        full_path = self.base_dir.parent / relative_path
        if not full_path.exists():
            return False, "File blob missing from storage"

        hasher = hashlib.sha256()
        with open(full_path, "rb") as f:
            while chunk := f.read(64 * 1024):
                hasher.update(chunk)
        actual_sha = hasher.hexdigest()
        return actual_sha.lower() == expected_sha256.lower(), actual_sha

    def read_blob(self, relative_path: str) -> bytes:
        full_path = self.base_dir.parent / relative_path
        with open(full_path, "rb") as f:
            return f.read()
