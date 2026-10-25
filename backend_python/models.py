"""
VersionVault - SQLAlchemy Database Models
PostgreSQL schema with foreign keys, indexes, timestamps, and optimistic locking.
"""

from datetime import datetime
import uuid
from typing import Optional, List
from sqlalchemy import (
    Column,
    String,
    Integer,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), default="engineer", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    versions = relationship("FileVersion", back_populates="author")
    files_created = relationship("FileRecord", back_populates="creator")


class FileRecord(Base):
    __tablename__ = "files"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(50), default="general", nullable=False, index=True)
    created_by_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    current_version_number = Column(Integer, default=1, nullable=False)
    current_version_id = Column(String(36), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    lock_version = Column(Integer, default=1, nullable=False)  # For optimistic concurrency
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    creator = relationship("User", back_populates="files_created")
    versions = relationship("FileVersion", back_populates="file", cascade="all, delete-orphan", order_by="FileVersion.version_number")

    __table_args__ = (
        Index("idx_files_filename_active", "filename", "is_deleted"),
        Index("idx_files_updated_at", "updated_at"),
    )


class FileVersion(Base):
    __tablename__ = "file_versions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    mime_type = Column(String(128), default="application/octet-stream", nullable=False)
    sha256_hash = Column(String(64), nullable=False, index=True)  # File integrity checksum
    storage_path = Column(String(512), nullable=False)  # Content-Addressable Storage path
    change_summary = Column(Text, nullable=True)
    author_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    author_name = Column(String(255), default="System", nullable=False)
    is_deduplicated = Column(Boolean, default=False, nullable=False)
    restored_from_version = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    file = relationship("FileRecord", back_populates="versions")
    author = relationship("User", back_populates="versions")

    __table_args__ = (
        UniqueConstraint("file_id", "version_number", name="uq_file_version_number"),
        Index("idx_file_version_sha", "sha256_hash"),
        Index("idx_file_version_created", "created_at"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String(36), nullable=False, index=True)
    action = Column(String(50), nullable=False)  # UPLOAD, VERSION_BUMP, RESTORE, CONFLICT_DETECTED, DELETE
    version_number = Column(Integer, nullable=True)
    actor_name = Column(String(255), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
