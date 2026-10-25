"""
VersionVault - FastAPI REST Backend
Full REST API for file versioning, optimistic locking, conflict detection,
SHA-256 verification, and history restoration.
"""

from datetime import datetime
import os
import io
import re
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

from .database import get_db, init_db
from .models import FileRecord, FileVersion, AuditLog
from .storage import StorageAdapter

app = FastAPI(
    title="VersionVault API",
    description="Enterprise File Versioning and Synchronization Engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage = StorageAdapter()

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
DISALLOWED_EXTENSIONS = {".exe", ".bat", ".cmd", ".vbs", ".msi", ".dll"}


# --- Pydantic Schemas ---
class VersionOut(BaseModel):
    id: str
    version_number: int
    size_bytes: int
    mime_type: str
    sha256_hash: str
    change_summary: Optional[str]
    author_name: str
    is_deduplicated: bool
    restored_from_version: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class FileOut(BaseModel):
    id: str
    filename: str
    description: Optional[str]
    category: str
    current_version_number: int
    current_version_id: Optional[str]
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    latest_version: Optional[VersionOut] = None

    class Config:
        from_attributes = True


class FileRenameRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = None


class ConflictDetails(BaseModel):
    error: str = "ConflictDetected"
    message: str
    file_id: str
    filename: str
    base_version: int
    current_server_version: int
    current_server_author: str
    current_server_summary: Optional[str]


def sanitize_filename(filename: str) -> str:
    cleaned = os.path.basename(filename.strip())
    cleaned = re.sub(r'[\r\n\t]', '', cleaned)
    if not cleaned or cleaned.startswith('.'):
        raise HTTPException(status_code=400, detail="Invalid filename")
    ext = os.path.splitext(cleaned)[1].lower()
    if ext in DISALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File extension {ext} is restricted for security.")
    return cleaned


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
def get_health():
    return {
        "status": "healthy",
        "service": "VersionVault",
        "timestamp": datetime.utcnow().isoformat(),
        "storage_engine": "Content-Addressable Storage (CAS)",
        "hash_algorithm": "SHA-256"
    }


@app.get("/api/files", response_model=dict)
def list_files(
    query: Optional[str] = None,
    category: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    include_deleted: bool = False,
    db: Session = Depends(get_db)
):
    q = db.query(FileRecord)
    if not include_deleted:
        q = q.filter(FileRecord.is_deleted == False)
    if query:
        q = q.filter(FileRecord.filename.ilike(f"%{query}%"))
    if category and category != "all":
        q = q.filter(FileRecord.category == category)

    total = q.count()
    records = q.order_by(desc(FileRecord.updated_at)).offset((page - 1) * limit).limit(limit).all()

    items = []
    for f in records:
        f_dict = FileOut.from_orm(f).dict()
        latest = db.query(FileVersion).filter(
            FileVersion.file_id == f.id,
            FileVersion.version_number == f.current_version_number
        ).first()
        f_dict["latest_version"] = VersionOut.from_orm(latest).dict() if latest else None
        items.append(f_dict)

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit if total > 0 else 1
    }


@app.post("/api/files", response_model=FileOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form("general"),
    author_name: Optional[str] = Form("Alex Rivera"),
    change_summary: Optional[str] = Form("Initial version upload"),
    db: Session = Depends(get_db)
):
    safe_name = sanitize_filename(file.filename)
    
    # Check duplicate active file
    existing = db.query(FileRecord).filter(
        FileRecord.filename == safe_name,
        FileRecord.is_deleted == False
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A file named '{safe_name}' already exists. Upload a new version to file ID {existing.id} instead."
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"File exceeds limit of {MAX_FILE_SIZE_BYTES / (1024*1024)}MB")

    # Store blob in CAS
    bio = io.BytesIO(content)
    sha256, storage_path, size, is_dedup = storage.save_blob(bio)

    try:
        new_file = FileRecord(
            filename=safe_name,
            description=description,
            category=category or "general",
            current_version_number=1,
            lock_version=1
        )
        db.add(new_file)
        db.flush()

        v1 = FileVersion(
            file_id=new_file.id,
            version_number=1,
            size_bytes=size,
            mime_type=file.content_type or "application/octet-stream",
            sha256_hash=sha256,
            storage_path=storage_path,
            change_summary=change_summary,
            author_name=author_name or "Engineer",
            is_deduplicated=is_dedup
        )
        db.add(v1)
        db.flush()

        new_file.current_version_id = v1.id
        db.add(AuditLog(
            file_id=new_file.id,
            action="UPLOAD",
            version_number=1,
            actor_name=author_name or "Engineer",
            details=f"Uploaded initial version (sha256: {sha256[:12]}...)"
        ))
        db.commit()
        db.refresh(new_file)

        res = FileOut.from_orm(new_file).dict()
        res["latest_version"] = VersionOut.from_orm(v1).dict()
        return res
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to persist file: {str(e)}")


@app.get("/api/files/{file_id}", response_model=dict)
def get_file(file_id: str, db: Session = Depends(get_db)):
    file_record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    versions = db.query(FileVersion).filter(
        FileVersion.file_id == file_id
    ).order_by(desc(FileVersion.version_number)).all()

    latest = next((v for v in versions if v.version_number == file_record.current_version_number), None)
    
    return {
        "file": FileOut.from_orm(file_record).dict(),
        "latest_version": VersionOut.from_orm(latest).dict() if latest else None,
        "total_versions": len(versions)
    }


@app.get("/api/files/{file_id}/versions", response_model=List[VersionOut])
def list_versions(file_id: str, db: Session = Depends(get_db)):
    file_record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    versions = db.query(FileVersion).filter(
        FileVersion.file_id == file_id
    ).order_by(desc(FileVersion.version_number)).all()
    return versions


@app.post("/api/files/{file_id}/versions", response_model=VersionOut)
async def upload_version(
    file_id: str,
    file: UploadFile = File(...),
    base_version: int = Form(...),  # Optimistic concurrency check
    override_conflict: bool = Form(False),
    change_summary: Optional[str] = Form("Updated file contents"),
    author_name: Optional[str] = Form("Alex Rivera"),
    db: Session = Depends(get_db)
):
    file_record = db.query(FileRecord).filter(
        FileRecord.id == file_id,
        FileRecord.is_deleted == False
    ).with_for_update().first()

    if not file_record:
        raise HTTPException(status_code=404, detail="File not found or deleted")

    # Optimistic locking & conflict detection
    if not override_conflict and file_record.current_version_number != base_version:
        current_ver = db.query(FileVersion).filter(
            FileVersion.file_id == file_id,
            FileVersion.version_number == file_record.current_version_number
        ).first()

        conflict_payload = {
            "error": "ConflictDetected",
            "message": f"Conflict detected: File '{file_record.filename}' was updated to v{file_record.current_version_number} by {current_ver.author_name if current_ver else 'another user'} while you were modifying v{base_version}.",
            "conflict": {
                "file_id": file_record.id,
                "filename": file_record.filename,
                "base_version": base_version,
                "current_server_version": file_record.current_version_number,
                "current_server_author": current_ver.author_name if current_ver else "Unknown",
                "current_server_summary": current_ver.change_summary if current_ver else None,
                "current_server_timestamp": current_ver.created_at.isoformat() if current_ver else None,
            }
        }
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=conflict_payload)

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds size limit")

    bio = io.BytesIO(content)
    sha256, storage_path, size, is_dedup = storage.save_blob(bio)

    # Check if identical to current version
    current_ver = db.query(FileVersion).filter(
        FileVersion.file_id == file_id,
        FileVersion.version_number == file_record.current_version_number
    ).first()
    if current_ver and current_ver.sha256_hash == sha256:
        # Same hash detection
        pass  # Proceed or allow as requested, preserving exact history

    next_version_num = file_record.current_version_number + 1

    try:
        new_version = FileVersion(
            file_id=file_id,
            version_number=next_version_num,
            size_bytes=size,
            mime_type=file.content_type or "application/octet-stream",
            sha256_hash=sha256,
            storage_path=storage_path,
            change_summary=change_summary,
            author_name=author_name or "Engineer",
            is_deduplicated=is_dedup
        )
        db.add(new_version)
        db.flush()

        file_record.current_version_number = next_version_num
        file_record.current_version_id = new_version.id
        file_record.lock_version += 1
        file_record.updated_at = datetime.utcnow()

        db.add(AuditLog(
            file_id=file_id,
            action="VERSION_BUMP",
            version_number=next_version_num,
            actor_name=author_name or "Engineer",
            details=f"Pushed v{next_version_num}: {change_summary} (sha256: {sha256[:12]}...)"
        ))

        db.commit()
        db.refresh(new_version)
        return new_version
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record version: {str(e)}")


@app.get("/api/files/{file_id}/versions/{version_id}/download")
def download_version(file_id: str, version_id: str, db: Session = Depends(get_db)):
    file_record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
    ver = db.query(FileVersion).filter(FileVersion.id == version_id, FileVersion.file_id == file_id).first()
    if not file_record or not ver:
        raise HTTPException(status_code=404, detail="File or version not found")

    # Verify integrity before serving
    is_valid, computed_sha = storage.verify_integrity(ver.storage_path, ver.sha256_hash)
    if not is_valid:
        raise HTTPException(
            status_code=500,
            detail=f"Integrity check failed: Expected {ver.sha256_hash}, calculated {computed_sha}"
        )

    blob_bytes = storage.read_blob(ver.storage_path)
    base_name, ext = os.path.splitext(file_record.filename)
    download_name = f"{base_name}_v{ver.version_number}{ext}"

    headers = {
        "Content-Disposition": f'attachment; filename="{download_name}"',
        "ETag": f'"{ver.sha256_hash}"',
        "X-Checksum-SHA256": ver.sha256_hash,
        "X-Version-Number": str(ver.version_number)
    }
    return Response(content=blob_bytes, media_type=ver.mime_type, headers=headers)


@app.post("/api/files/{file_id}/restore/{version_id}", response_model=VersionOut)
def restore_version(
    file_id: str,
    version_id: str,
    actor_name: Optional[str] = Query("Alex Rivera"),
    db: Session = Depends(get_db)
):
    file_record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
    target_ver = db.query(FileVersion).filter(FileVersion.id == version_id, FileVersion.file_id == file_id).first()
    if not file_record or not target_ver:
        raise HTTPException(status_code=404, detail="File or target version not found")

    next_version_num = file_record.current_version_number + 1

    try:
        restored = FileVersion(
            file_id=file_id,
            version_number=next_version_num,
            size_bytes=target_ver.size_bytes,
            mime_type=target_ver.mime_type,
            sha256_hash=target_ver.sha256_hash,
            storage_path=target_ver.storage_path,
            change_summary=f"Restored from version {target_ver.version_number}",
            author_name=actor_name,
            is_deduplicated=True,
            restored_from_version=target_ver.version_number
        )
        db.add(restored)
        db.flush()

        file_record.current_version_number = next_version_num
        file_record.current_version_id = restored.id
        file_record.lock_version += 1
        file_record.updated_at = datetime.utcnow()

        db.add(AuditLog(
            file_id=file_id,
            action="RESTORE",
            version_number=next_version_num,
            actor_name=actor_name,
            details=f"Restored state of v{target_ver.version_number} as v{next_version_num}"
        ))

        db.commit()
        db.refresh(restored)
        return restored
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to restore version: {str(e)}")


@app.post("/api/files/{file_id}/versions/{version_id}/verify-integrity")
def verify_version_integrity(file_id: str, version_id: str, db: Session = Depends(get_db)):
    ver = db.query(FileVersion).filter(FileVersion.id == version_id, FileVersion.file_id == file_id).first()
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    is_valid, computed_sha = storage.verify_integrity(ver.storage_path, ver.sha256_hash)
    return {
        "verified": is_valid,
        "recorded_sha256": ver.sha256_hash,
        "computed_sha256": computed_sha,
        "status": "VALID" if is_valid else "CORRUPTED",
        "checked_at": datetime.utcnow().isoformat()
    }


@app.patch("/api/files/{file_id}")
def rename_file(file_id: str, req: FileRenameRequest, db: Session = Depends(get_db)):
    file_record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    safe_name = sanitize_filename(req.filename)
    file_record.filename = safe_name
    if req.description is not None:
        file_record.description = req.description
    if req.category:
        file_record.category = req.category
    file_record.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(file_record)
    return {"message": "File metadata updated", "file": FileOut.from_orm(file_record).dict()}


@app.delete("/api/files/{file_id}")
def delete_file(file_id: str, purge: bool = False, db: Session = Depends(get_db)):
    file_record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    if purge:
        db.delete(file_record)
        db.commit()
        return {"message": "File and all versions permanently purged"}
    else:
        file_record.is_deleted = True
        file_record.deleted_at = datetime.utcnow()
        db.commit()
        return {"message": "File soft-deleted according to 30-day retention policy"}
