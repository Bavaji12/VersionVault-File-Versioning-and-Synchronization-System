import React, { useState } from 'react';
import {
  Play,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Terminal,
  Server,
  Database,
  Container,
  ShieldCheck,
  Copy,
  Check,
} from 'lucide-react';
import { TestSuiteResult } from '../types';
import { api } from '../api';

const CODE_SNIPPETS = {
  fastapi: `from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from .models import FileRecord, FileVersion
from .storage import StorageAdapter

app = FastAPI(title="VersionVault API")
storage = StorageAdapter()

@app.post("/api/files/{file_id}/versions", status_code=201)
async def upload_version(
    file_id: str,
    file: UploadFile = File(...),
    base_version: int = Form(...), # Optimistic locking token
    override_conflict: bool = Form(False),
    db: Session = Depends(get_db)
):
    file_record = db.query(FileRecord).filter(FileRecord.id == file_id).with_for_update().first()
    
    # 409 Conflict Detection
    if not override_conflict and file_record.current_version_number != base_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "ConflictDetected",
                "message": f"Stale base v{base_version}. Server is at v{file_record.current_version_number}",
                "server_version": file_record.current_version_number
            }
        )

    # Compute SHA-256 and store in Content-Addressable Storage
    sha256, path, size, is_dedup = storage.save_blob(file.file)
    ...`,

  sqlalchemy: `from sqlalchemy import Column, String, Integer, BigInteger, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

class FileRecord(Base):
    __tablename__ = "files"
    id = Column(String(36), primary_key=True)
    filename = Column(String(255), nullable=False, index=True)
    current_version_number = Column(Integer, default=1, nullable=False)
    lock_version = Column(Integer, default=1, nullable=False) # Concurrency version
    is_deleted = Column(Boolean, default=False, index=True)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    versions = relationship("FileVersion", back_populates="file", cascade="all, delete-orphan")

class FileVersion(Base):
    __tablename__ = "file_versions"
    id = Column(String(36), primary_key=True)
    file_id = Column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    sha256_hash = Column(String(64), nullable=False, index=True) # Integrity checksum
    storage_path = Column(String(512), nullable=False) # CAS sharded path
    is_deduplicated = Column(Boolean, default=False)
    
    __table_args__ = (
        UniqueConstraint("file_id", "version_number", name="uq_file_version"),
    )`,

  pytest: `def test_optimistic_locking_conflict_409(client):
    """Asserts that client attempting update on stale version receives HTTP 409"""
    r1 = client.post("/api/files", files={"file": ("config.json", b'{"v": 1}')})
    file_id = r1.json()["id"]

    # Client A moves head to v2
    client.post(f"/api/files/{file_id}/versions", data={"base_version": 1})

    # Client B tries to update based on stale v1
    conflict_res = client.post(f"/api/files/{file_id}/versions", data={"base_version": 1})
    assert conflict_res.status_code == 409
    assert conflict_res.json()["detail"]["error"] == "ConflictDetected"
    assert conflict_res.json()["detail"]["server_version"] == 2`,

  docker: `version: '3.8'
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: versionvault
      POSTGRES_PASSWORD: vault_secure_password
      POSTGRES_DB: versionvault_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: .
    environment:
      - DATABASE_URL=postgresql://versionvault:vault_secure_password@db:5432/versionvault_db
    ports:
      - "8000:8000"
    volumes:
      - vault_storage:/app/vault_storage`,
};

export const ArchitectureView: React.FC = () => {
  const [selectedSnippet, setSelectedSnippet] = useState<keyof typeof CODE_SNIPPETS>('fastapi');
  const [testResults, setTestResults] = useState<TestSuiteResult | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const data = await api.runTestSuite();
      setTestResults(data);
    } catch (err: any) {
      alert(`Test run failed: ${err.message}`);
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Architecture & Engineering Fundamentals Header */}
      <div className="bg-[#0f1523] border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <span>Full-Stack Architecture & Verification Suite</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              VersionVault is built on production software engineering principles: optimistic concurrency control,
              content-addressable storage (CAS), cryptographic verification, and transactional integrity.
            </p>
          </div>

          <button
            onClick={handleRunTests}
            disabled={isRunningTests}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${isRunningTests ? 'animate-pulse' : ''}`} />
            <span>{isRunningTests ? 'Executing Test Runner...' : 'Execute Automated API Test Suite'}</span>
          </button>
        </div>

        {/* Live Test Results Runner */}
        {testResults ? (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-white">
                  {testResults.passed_tests} of {testResults.total_tests} Integration Tests Passed
                </span>
              </div>
              <span className="font-mono tabular-nums text-slate-400">
                Duration: {testResults.total_duration_ms} ms
              </span>
            </div>

            <div className="border border-slate-800 rounded divide-y divide-slate-800/60 bg-[#070b13] overflow-hidden">
              {testResults.results.map((test, idx) => (
                <div key={idx} className="p-3 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="font-semibold text-slate-200">{test.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 ml-5 font-mono">{test.details}</p>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px] shrink-0 ml-5 md:ml-0">
                    <span className="text-slate-500">{test.latency_ms}ms</span>
                    <span className="text-emerald-400 font-bold px-1.5 py-0.5 bg-emerald-950/60 rounded border border-emerald-800/60">
                      {test.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 p-4 rounded bg-slate-900/40 border border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <span>
              Click <strong>"Execute Automated API Test Suite"</strong> above to run real assertions against the live
              concurrency engine, SHA-256 CAS verification, and path traversal security guards.
            </span>
          </div>
        )}
      </div>

      {/* Codebase & Database Design Viewer */}
      <div className="bg-[#0f1523] border border-slate-800 rounded-lg overflow-hidden">
        {/* Code tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setSelectedSnippet('fastapi')}
              className={`px-3 py-1 rounded font-medium transition-colors cursor-pointer ${
                selectedSnippet === 'fastapi'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              FastAPI Endpoints (main.py)
            </button>
            <button
              onClick={() => setSelectedSnippet('sqlalchemy')}
              className={`px-3 py-1 rounded font-medium transition-colors cursor-pointer ${
                selectedSnippet === 'sqlalchemy'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              SQLAlchemy & Neon (models.py)
            </button>
            <button
              onClick={() => setSelectedSnippet('pytest')}
              className={`px-3 py-1 rounded font-medium transition-colors cursor-pointer ${
                selectedSnippet === 'pytest'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              pytest Concurrency Suite
            </button>
            <button
              onClick={() => setSelectedSnippet('docker')}
              className={`px-3 py-1 rounded font-medium transition-colors cursor-pointer ${
                selectedSnippet === 'docker'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Docker & Postgres
            </button>
          </div>

          <button
            onClick={() => handleCopy(CODE_SNIPPETS[selectedSnippet])}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>

        {/* Code display */}
        <div className="p-4 bg-[#070a13] overflow-x-auto text-xs font-mono text-slate-300 leading-relaxed">
          <pre>{CODE_SNIPPETS[selectedSnippet]}</pre>
        </div>
      </div>
    </div>
  );
};
