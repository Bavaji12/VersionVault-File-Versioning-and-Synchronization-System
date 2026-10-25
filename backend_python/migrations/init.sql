-- VersionVault PostgreSQL Schema Initialization
-- Compatible with Neon Serverless Postgres and standard PostgreSQL 14+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'engineer' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Files Table
CREATE TABLE IF NOT EXISTS files (
    id VARCHAR(36) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general' NOT NULL,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    current_version_number INTEGER DEFAULT 1 NOT NULL,
    current_version_id VARCHAR(36),
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    lock_version INTEGER DEFAULT 1 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_filename_active ON files(filename, is_deleted);
CREATE INDEX IF NOT EXISTS idx_files_category ON files(category);
CREATE INDEX IF NOT EXISTS idx_files_updated_at ON files(updated_at DESC);

-- File Versions Table
CREATE TABLE IF NOT EXISTS file_versions (
    id VARCHAR(36) PRIMARY KEY,
    file_id VARCHAR(36) NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(128) DEFAULT 'application/octet-stream' NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    change_summary TEXT,
    author_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(255) DEFAULT 'System' NOT NULL,
    is_deduplicated BOOLEAN DEFAULT FALSE NOT NULL,
    restored_from_version INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_file_version_number UNIQUE (file_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_file_version_sha ON file_versions(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_file_version_file_id ON file_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_file_version_created ON file_versions(created_at DESC);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    file_id VARCHAR(36) NOT NULL,
    action VARCHAR(50) NOT NULL,
    version_number INTEGER,
    actor_name VARCHAR(255) NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_file ON audit_logs(file_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
