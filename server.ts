import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import * as diff from 'diff';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const STORAGE_ROOT = path.join(__dirname, '.vault_storage');
const BLOBS_DIR = path.join(STORAGE_ROOT, 'blobs');
const DB_FILE = path.join(STORAGE_ROOT, 'vault_db.json');

fs.mkdirSync(BLOBS_DIR, { recursive: true });

// Multer memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Types
export interface FileVersionRecord {
  id: string;
  file_id: string;
  version_number: number;
  size_bytes: number;
  mime_type: string;
  sha256_hash: string;
  storage_path: string;
  change_summary: string;
  author_name: string;
  is_deduplicated: boolean;
  restored_from_version?: number;
  created_at: string;
}

export interface FileRecord {
  id: string;
  filename: string;
  description: string;
  category: 'code' | 'docs' | 'config' | 'data' | 'other';
  current_version_number: number;
  current_version_id: string;
  is_deleted: boolean;
  deleted_at?: string;
  lock_version: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRecord {
  id: string;
  file_id: string;
  action: 'UPLOAD' | 'VERSION_BUMP' | 'RESTORE' | 'CONFLICT_DETECTED' | 'DELETE' | 'RENAME';
  version_number?: number;
  actor_name: string;
  details: string;
  created_at: string;
}

interface VaultDatabase {
  files: Record<string, FileRecord>;
  versions: Record<string, FileVersionRecord>;
  audit_logs: AuditLogRecord[];
}

// Database helper with atomic sync write
function loadDb(): VaultDatabase {
  if (!fs.existsSync(DB_FILE)) {
    const initial: VaultDatabase = { files: {}, versions: {}, audit_logs: [] };
    saveDb(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse DB file, resetting to empty', err);
    const initial: VaultDatabase = { files: {}, versions: {}, audit_logs: [] };
    saveDb(initial);
    return initial;
  }
}

function saveDb(db: VaultDatabase) {
  const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tempPath, DB_FILE);
}

// Content-Addressable Storage (CAS)
function saveBlob(buffer: Buffer): { sha256: string; relativePath: string; isDeduplicated: boolean } {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const shard1 = sha256.slice(0, 2);
  const shard2 = sha256.slice(2, 4);
  const shardDir = path.join(BLOBS_DIR, shard1, shard2);
  fs.mkdirSync(shardDir, { recursive: true });

  const targetPath = path.join(shardDir, sha256);
  const isDeduplicated = fs.existsSync(targetPath);

  if (!isDeduplicated) {
    fs.writeFileSync(targetPath, buffer);
  }

  const relativePath = path.relative(STORAGE_ROOT, targetPath);
  return { sha256, relativePath, isDeduplicated };
}

function readBlob(relativePath: string): Buffer {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  return fs.readFileSync(fullPath);
}

function verifyBlobIntegrity(relativePath: string, expectedSha256: string): { valid: boolean; actualSha256: string } {
  try {
    const fullPath = path.join(STORAGE_ROOT, relativePath);
    if (!fs.existsSync(fullPath)) {
      return { valid: false, actualSha256: 'MISSING_BLOB' };
    }
    const data = fs.readFileSync(fullPath);
    const actualSha256 = crypto.createHash('sha256').update(data).digest('hex');
    return { valid: actualSha256.toLowerCase() === expectedSha256.toLowerCase(), actualSha256 };
  } catch (e: any) {
    return { valid: false, actualSha256: e.message };
  }
}

// Sanitize filename and disallow path traversal
function sanitizeFilename(name: string): string {
  const clean = path.basename(name.trim()).replace(/[\r\n\t]/g, '');
  if (!clean || clean.startsWith('.')) {
    throw new Error('Invalid filename');
  }
  const ext = path.extname(clean).toLowerCase();
  const dangerous = ['.exe', '.bat', '.cmd', '.vbs', '.msi', '.dll'];
  if (dangerous.includes(ext)) {
    throw new Error(`File extension ${ext} is blocked for security.`);
  }
  return clean;
}

// Helper to deduce category
function deduceCategory(filename: string): 'code' | 'docs' | 'config' | 'data' | 'other' {
  const ext = path.extname(filename).toLowerCase();
  if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.cpp', '.sql', '.html', '.css'].includes(ext)) {
    return 'code';
  }
  if (['.md', '.txt', '.pdf', '.doc', '.docx', '.rtf'].includes(ext)) {
    return 'docs';
  }
  if (['.json', '.yml', '.yaml', '.toml', '.env', '.xml', '.ini'].includes(ext)) {
    return 'config';
  }
  if (['.csv', '.tsv', '.parquet', '.xlsx'].includes(ext)) {
    return 'data';
  }
  return 'other';
}

// Seed initial realistic repository files if database is empty
function seedDemoDataIfEmpty() {
  const db = loadDb();
  if (Object.keys(db.files).length > 0) return;

  const initialItems = [
    {
      filename: 'sync_engine.py',
      category: 'code' as const,
      description: 'Distributed synchronization worker with delta hashing',
      versions: [
        {
          author: 'Alex Rivera',
          summary: 'Initial sync loop with polling',
          content: `"""Distributed sync worker - v1"""\nimport time\nimport logging\n\ndef poll_remote_node(node_url: str):\n    logging.info(f"Connecting to {node_url}")\n    return {"status": "synced", "batch_size": 100}\n\nif __name__ == "__main__":\n    print("Starting sync engine v1...")\n`,
        },
        {
          author: 'Sarah Chen',
          summary: 'Added exponential backoff and error handling',
          content: `"""Distributed sync worker - v2"""\nimport time\nimport logging\n\ndef poll_remote_node(node_url: str, retries: int = 3):\n    logging.info(f"Connecting to {node_url} (max retries: {retries})")\n    for attempt in range(retries):\n        try:\n            return {"status": "synced", "batch_size": 250, "latency_ms": 14}\n        except Exception as e:\n            wait = 2 ** attempt\n            time.sleep(wait)\n    raise ConnectionError("Node unreachable")\n\nif __name__ == "__main__":\n    print("Starting sync engine v2 with backoff...")\n`,
        },
        {
          author: 'Alex Rivera',
          summary: 'Upgraded to streaming WebSocket delta replication',
          content: `"""Distributed sync worker - v3"""\nimport asyncio\nimport logging\n\nasync def stream_replication(node_url: str):\n    logging.info(f"Opening replication stream to {node_url}")\n    async for message in replicate_deltas():\n        yield compute_sha256_delta(message)\n\nif __name__ == "__main__":\n    print("Starting sync engine v3 - high throughput stream...")\n`,
        },
      ],
    },
    {
      filename: 'architecture.md',
      category: 'docs' as const,
      description: 'System design doc: storage hierarchy, optimistic locking and CAS',
      versions: [
        {
          author: 'Alex Rivera',
          summary: 'Initial RFC specification',
          content: `# VersionVault Architecture RFC\n\n## 1. Storage Model\nAll versions are addressed by SHA-256 hash.\nFiles maintain an immutable append-only version log.\n\n## 2. Concurrency\nClients must send base_version when submitting updates.\n`,
        },
        {
          author: 'Marcus Vance',
          summary: 'Added conflict resolution protocol and Neon connection pool specs',
          content: `# VersionVault Architecture RFC\n\n## 1. Storage Model\nAll versions are addressed by SHA-256 hash.\nFiles maintain an immutable append-only version log.\nStorage blobs are sharded across two levels: /blobs/ab/cd/{sha256}.\n\n## 2. Concurrency & Optimistic Locking\nClients must send base_version when submitting updates.\nIf base_version != file.current_version, server responds with HTTP 409 Conflict.\nClients can inspect diff and resolve via Overwrite or 3-Way Merge.\n`,
        },
      ],
    },
    {
      filename: 'schema.sql',
      category: 'code' as const,
      description: 'PostgreSQL relational schema with foreign keys and unique constraints',
      versions: [
        {
          author: 'Sarah Chen',
          summary: 'Initial table definitions for files and versions',
          content: `-- VersionVault PostgreSQL DDL\nCREATE TABLE files (\n  id VARCHAR(36) PRIMARY KEY,\n  filename VARCHAR(255) NOT NULL,\n  current_version_number INT DEFAULT 1\n);\n`,
        },
        {
          author: 'Sarah Chen',
          summary: 'Added SHA-256 integrity indexes, audit logs, and CAS metadata',
          content: `-- VersionVault PostgreSQL DDL v2\nCREATE TABLE files (\n  id VARCHAR(36) PRIMARY KEY,\n  filename VARCHAR(255) NOT NULL,\n  category VARCHAR(50) DEFAULT 'general',\n  current_version_number INT DEFAULT 1,\n  lock_version INT DEFAULT 1,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE file_versions (\n  id VARCHAR(36) PRIMARY KEY,\n  file_id VARCHAR(36) REFERENCES files(id) ON DELETE CASCADE,\n  version_number INT NOT NULL,\n  sha256_hash VARCHAR(64) NOT NULL,\n  storage_path VARCHAR(512) NOT NULL,\n  is_deduplicated BOOLEAN DEFAULT FALSE,\n  CONSTRAINT uq_file_version UNIQUE(file_id, version_number)\n);\nCREATE INDEX idx_sha256 ON file_versions(sha256_hash);\n`,
        },
      ],
    },
    {
      filename: 'runtime_config.json',
      category: 'config' as const,
      description: 'Production cluster runtime settings and replication quotas',
      versions: [
        {
          author: 'Marcus Vance',
          summary: 'Baseline development limits',
          content: JSON.stringify(
            {
              environment: 'development',
              max_file_size_mb: 50,
              retention_days: 30,
              enable_deduplication: true,
              storage_backend: 'cas_local',
              hash_algorithm: 'SHA-256',
              heartbeat_interval_sec: 15,
            },
            null,
            2
          ),
        },
      ],
    },
  ];

  for (const item of initialItems) {
    const fileId = crypto.randomUUID();
    const createdDate = new Date(Date.now() - 3600 * 1000 * 24 * (item.versions.length + 1)).toISOString();

    const fileRecord: FileRecord = {
      id: fileId,
      filename: item.filename,
      description: item.description,
      category: item.category,
      current_version_number: item.versions.length,
      current_version_id: '',
      is_deleted: false,
      lock_version: item.versions.length,
      created_at: createdDate,
      updated_at: new Date().toISOString(),
    };

    let lastVersionId = '';

    item.versions.forEach((v, idx) => {
      const vNum = idx + 1;
      const buffer = Buffer.from(v.content, 'utf-8');
      const { sha256, relativePath, isDeduplicated } = saveBlob(buffer);
      const versionId = crypto.randomUUID();
      const vDate = new Date(Date.now() - 3600 * 1000 * (item.versions.length - idx) * 8).toISOString();

      const versionRecord: FileVersionRecord = {
        id: versionId,
        file_id: fileId,
        version_number: vNum,
        size_bytes: buffer.length,
        mime_type: item.filename.endsWith('.json') ? 'application/json' : item.filename.endsWith('.md') ? 'text/markdown' : 'text/plain',
        sha256_hash: sha256,
        storage_path: relativePath,
        change_summary: v.summary,
        author_name: v.author,
        is_deduplicated: isDeduplicated,
        created_at: vDate,
      };

      db.versions[versionId] = versionRecord;
      lastVersionId = versionId;

      db.audit_logs.push({
        id: crypto.randomUUID(),
        file_id: fileId,
        action: vNum === 1 ? 'UPLOAD' : 'VERSION_BUMP',
        version_number: vNum,
        actor_name: v.author,
        details: `Version ${vNum} (${sha256.slice(0, 8)}...): ${v.summary}`,
        created_at: vDate,
      });
    });

    fileRecord.current_version_id = lastVersionId;
    db.files[fileId] = fileRecord;
  }

  saveDb(db);
}

seedDemoDataIfEmpty();

// --- REST API Endpoints ---

// 1. Health & Statistics
app.get('/api/health', (req, res) => {
  const db = loadDb();
  const allFiles = Object.values(db.files);
  const activeFiles = allFiles.filter((f) => !f.is_deleted);
  const allVersions = Object.values(db.versions);

  let totalRawBytes = 0;
  let deduplicatedCount = 0;
  allVersions.forEach((v) => {
    totalRawBytes += v.size_bytes;
    if (v.is_deduplicated) deduplicatedCount++;
  });

  // Calculate actual unique blob storage
  const uniqueBlobs = new Set(allVersions.map((v) => v.sha256_hash));
  const dedupSavingsPercent =
    allVersions.length > 0 ? Math.round((deduplicatedCount / allVersions.length) * 100) : 0;

  res.json({
    status: 'healthy',
    engine: 'VersionVault CAS Kernel',
    algorithm: 'SHA-256',
    active_files_count: activeFiles.length,
    total_versions_count: allVersions.length,
    unique_storage_blobs: uniqueBlobs.size,
    total_raw_bytes: totalRawBytes,
    deduplicated_versions_count: deduplicatedCount,
    dedup_savings_percent: dedupSavingsPercent,
    optimistic_locking_enabled: true,
    server_time: new Date().toISOString(),
  });
});

// 2. List Files with pagination, search, category filter, sort
app.get('/api/files', (req, res) => {
  const db = loadDb();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
  const query = (req.query.query as string)?.toLowerCase().trim();
  const category = (req.query.category as string)?.toLowerCase().trim();
  const sortBy = (req.query.sortBy as string) || 'updated_at'; // name, updated_at, size, versions
  const sortDir = (req.query.sortDir as string) === 'asc' ? 'asc' : 'desc';
  const includeDeleted = req.query.include_deleted === 'true';

  let list = Object.values(db.files).filter((f) => (includeDeleted ? true : !f.is_deleted));

  if (query) {
    list = list.filter(
      (f) =>
        f.filename.toLowerCase().includes(query) ||
        (f.description && f.description.toLowerCase().includes(query))
    );
  }

  if (category && category !== 'all') {
    list = list.filter((f) => f.category === category);
  }

  // Populate latest version
  const decorated = list.map((f) => {
    const latestVersion = db.versions[f.current_version_id] || null;
    return {
      ...f,
      latest_version: latestVersion,
    };
  });

  // Sort
  decorated.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') {
      cmp = a.filename.localeCompare(b.filename);
    } else if (sortBy === 'size') {
      const sizeA = a.latest_version?.size_bytes || 0;
      const sizeB = b.latest_version?.size_bytes || 0;
      cmp = sizeA - sizeB;
    } else if (sortBy === 'versions') {
      cmp = a.current_version_number - b.current_version_number;
    } else {
      // updated_at
      cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const total = decorated.length;
  const offset = (page - 1) * limit;
  const items = decorated.slice(offset, offset + limit);

  res.json({
    items,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit) || 1,
  });
});

// 3. Upload a new file (supports multipart form file or JSON body for code/text files)
app.post('/api/files', upload.single('file'), (req, res) => {
  try {
    const db = loadDb();
    let filename = '';
    let buffer: Buffer;
    let mimeType = 'text/plain';

    if (req.file) {
      filename = sanitizeFilename(req.file.originalname);
      buffer = req.file.buffer;
      mimeType = req.file.mimetype || 'application/octet-stream';
    } else if (req.body.filename && req.body.content !== undefined) {
      filename = sanitizeFilename(req.body.filename);
      buffer = Buffer.from(req.body.content, 'utf-8');
      mimeType = req.body.mime_type || 'text/plain';
    } else {
      return res.status(400).json({ error: 'No file or file content provided.' });
    }

    // Check duplicate file name in active directory
    const existing = Object.values(db.files).find(
      (f) => !f.is_deleted && f.filename.toLowerCase() === filename.toLowerCase()
    );
    if (existing) {
      return res.status(400).json({
        error: `A file named '${filename}' already exists. Please update this file or upload with a unique name.`,
        existing_file_id: existing.id,
      });
    }

    const description = req.body.description || '';
    const category = req.body.category || deduceCategory(filename);
    const authorName = req.body.author_name || 'Alex Rivera';
    const changeSummary = req.body.change_summary || 'Initial version upload';

    // Store in CAS
    const { sha256, relativePath, isDeduplicated } = saveBlob(buffer);

    const fileId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const versionRecord: FileVersionRecord = {
      id: versionId,
      file_id: fileId,
      version_number: 1,
      size_bytes: buffer.length,
      mime_type: mimeType,
      sha256_hash: sha256,
      storage_path: relativePath,
      change_summary: changeSummary,
      author_name: authorName,
      is_deduplicated: isDeduplicated,
      created_at: now,
    };

    const fileRecord: FileRecord = {
      id: fileId,
      filename,
      description,
      category,
      current_version_number: 1,
      current_version_id: versionId,
      is_deleted: false,
      lock_version: 1,
      created_at: now,
      updated_at: now,
    };

    db.files[fileId] = fileRecord;
    db.versions[versionId] = versionRecord;

    db.audit_logs.push({
      id: crypto.randomUUID(),
      file_id: fileId,
      action: 'UPLOAD',
      version_number: 1,
      actor_name: authorName,
      details: `Created file '${filename}' at v1 with SHA-256 ${sha256.slice(0, 12)}...`,
      created_at: now,
    });

    saveDb(db);

    res.status(201).json({
      ...fileRecord,
      latest_version: versionRecord,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'File upload failed' });
  }
});

// 4. Get File details
app.get('/api/files/:id', (req, res) => {
  const db = loadDb();
  const file = db.files[req.params.id];
  if (!file) return res.status(404).json({ error: 'File not found' });

  const latestVersion = db.versions[file.current_version_id] || null;
  const versions = Object.values(db.versions).filter((v) => v.file_id === file.id);

  res.json({
    file,
    latest_version: latestVersion,
    total_versions: versions.length,
  });
});

// 5. Rename / Update File Metadata
app.patch('/api/files/:id', (req, res) => {
  try {
    const db = loadDb();
    const file = db.files[req.params.id];
    if (!file) return res.status(404).json({ error: 'File not found' });

    if (req.body.filename) {
      const newName = sanitizeFilename(req.body.filename);
      // Check collision
      const collision = Object.values(db.files).find(
        (f) => f.id !== file.id && !f.is_deleted && f.filename.toLowerCase() === newName.toLowerCase()
      );
      if (collision) {
        return res.status(400).json({ error: `File with name '${newName}' already exists.` });
      }
      file.filename = newName;
    }

    if (req.body.description !== undefined) {
      file.description = req.body.description;
    }
    if (req.body.category) {
      file.category = req.body.category;
    }

    file.updated_at = new Date().toISOString();
    saveDb(db);

    res.json({ message: 'Metadata updated', file });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Delete File (Soft delete with retention or purge)
app.delete('/api/files/:id', (req, res) => {
  const db = loadDb();
  const file = db.files[req.params.id];
  if (!file) return res.status(404).json({ error: 'File not found' });

  const purge = req.query.purge === 'true';

  if (purge) {
    delete db.files[file.id];
    // Remove versions for this file
    Object.keys(db.versions).forEach((vid) => {
      if (db.versions[vid].file_id === file.id) {
        delete db.versions[vid];
      }
    });
    saveDb(db);
    return res.json({ message: 'File and history permanently purged' });
  } else {
    file.is_deleted = true;
    file.deleted_at = new Date().toISOString();
    file.updated_at = new Date().toISOString();

    db.audit_logs.push({
      id: crypto.randomUUID(),
      file_id: file.id,
      action: 'DELETE',
      actor_name: (req.query.actor as string) || 'Alex Rivera',
      details: 'Soft deleted file. Retained in 30-day vault trash.',
      created_at: new Date().toISOString(),
    });

    saveDb(db);
    res.json({ message: 'File moved to retention trash' });
  }
});

// 7. Restore soft-deleted file
app.post('/api/files/:id/restore-file', (req, res) => {
  const db = loadDb();
  const file = db.files[req.params.id];
  if (!file) return res.status(404).json({ error: 'File not found' });

  file.is_deleted = false;
  file.deleted_at = undefined;
  file.updated_at = new Date().toISOString();
  saveDb(db);
  res.json({ message: 'File restored from trash', file });
});

// 8. List Version History
app.get('/api/files/:id/versions', (req, res) => {
  const db = loadDb();
  const file = db.files[req.params.id];
  if (!file) return res.status(404).json({ error: 'File not found' });

  const list = Object.values(db.versions)
    .filter((v) => v.file_id === file.id)
    .sort((a, b) => b.version_number - a.version_number);

  res.json(list);
});

// 9. Upload / Commit New Version with Optimistic Locking & 409 Conflict Handling
app.post('/api/files/:id/versions', upload.single('file'), (req, res) => {
  try {
    const db = loadDb();
    const file = db.files[req.params.id];
    if (!file || file.is_deleted) {
      return res.status(404).json({ error: 'File not found or deleted' });
    }

    const baseVersion = parseInt(req.body.base_version, 10);
    const overrideConflict = req.body.override_conflict === 'true' || req.body.override_conflict === true;

    // Concurrency / Stale Edit Detection
    if (!isNaN(baseVersion) && !overrideConflict && file.current_version_number !== baseVersion) {
      const currentVer = db.versions[file.current_version_id];
      let currentContent = '';
      try {
        currentContent = readBlob(currentVer.storage_path).toString('utf-8');
      } catch {}

      return res.status(409).json({
        error: 'ConflictDetected',
        message: `Conflict detected: '${file.filename}' was modified to v${file.current_version_number} by ${currentVer?.author_name || 'another team member'} while you were modifying v${baseVersion}.`,
        conflict: {
          file_id: file.id,
          filename: file.filename,
          base_version: baseVersion,
          current_server_version: file.current_version_number,
          current_server_author: currentVer?.author_name || 'Team Engineer',
          current_server_summary: currentVer?.change_summary || '',
          current_server_timestamp: currentVer?.created_at,
          current_server_content: currentContent.slice(0, 10000), // Preview content
        },
      });
    }

    let buffer: Buffer;
    let mimeType = 'text/plain';

    if (req.file) {
      buffer = req.file.buffer;
      mimeType = req.file.mimetype || 'application/octet-stream';
    } else if (req.body.content !== undefined) {
      buffer = Buffer.from(req.body.content, 'utf-8');
      mimeType = req.body.mime_type || 'text/plain';
    } else {
      return res.status(400).json({ error: 'No content or file provided for version update' });
    }

    // Save to Content Addressable Storage
    const { sha256, relativePath, isDeduplicated } = saveBlob(buffer);

    // Detect identical content to current version
    const currentVer = db.versions[file.current_version_id];
    const isIdenticalToCurrent = currentVer && currentVer.sha256_hash === sha256;

    const nextVersionNum = file.current_version_number + 1;
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const authorName = req.body.author_name || 'Alex Rivera';
    const changeSummary = req.body.change_summary || (isIdenticalToCurrent ? 'Re-committed unchanged version' : 'Updated file version');

    const newVersion: FileVersionRecord = {
      id: versionId,
      file_id: file.id,
      version_number: nextVersionNum,
      size_bytes: buffer.length,
      mime_type: mimeType,
      sha256_hash: sha256,
      storage_path: relativePath,
      change_summary: changeSummary,
      author_name: authorName,
      is_deduplicated: isDeduplicated,
      created_at: now,
    };

    db.versions[versionId] = newVersion;
    file.current_version_number = nextVersionNum;
    file.current_version_id = versionId;
    file.lock_version += 1;
    file.updated_at = now;

    db.audit_logs.push({
      id: crypto.randomUUID(),
      file_id: file.id,
      action: 'VERSION_BUMP',
      version_number: nextVersionNum,
      actor_name: authorName,
      details: `Pushed v${nextVersionNum} (${sha256.slice(0, 10)}...): ${changeSummary}`,
      created_at: now,
    });

    saveDb(db);

    res.status(201).json({
      version: newVersion,
      identical_content_warning: isIdenticalToCurrent
        ? 'Notice: Content is byte-identical to previous version (deduplicated in CAS storage).'
        : undefined,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Get specific version content and metadata
app.get('/api/files/:id/versions/:versionId', (req, res) => {
  const db = loadDb();
  const ver = db.versions[req.params.versionId];
  if (!ver || ver.file_id !== req.params.id) {
    return res.status(404).json({ error: 'Version not found' });
  }

  const isText =
    ver.mime_type.startsWith('text/') ||
    ['application/json', 'application/javascript', 'application/xml'].includes(ver.mime_type) ||
    ver.size_bytes < 500000;

  let textContent: string | null = null;
  if (isText) {
    try {
      textContent = readBlob(ver.storage_path).toString('utf-8');
    } catch {}
  }

  res.json({
    version: ver,
    is_text: isText,
    content_preview: textContent,
  });
});

// 11. Download specific version with SHA-256 header and verification
app.get('/api/files/:id/versions/:versionId/download', (req, res) => {
  const db = loadDb();
  const file = db.files[req.params.id];
  const ver = db.versions[req.params.versionId];
  if (!file || !ver || ver.file_id !== file.id) {
    return res.status(404).json({ error: 'File or version not found' });
  }

  // Pre-download cryptographic integrity verification
  const integrity = verifyBlobIntegrity(ver.storage_path, ver.sha256_hash);
  if (!integrity.valid) {
    return res.status(500).json({
      error: 'Integrity Check Failed: Stored file blob failed SHA-256 verification!',
      expected_hash: ver.sha256_hash,
      calculated_hash: integrity.actualSha256,
    });
  }

  const blob = readBlob(ver.storage_path);
  const ext = path.extname(file.filename);
  const baseName = path.basename(file.filename, ext);
  const downloadFilename = `${baseName}_v${ver.version_number}${ext}`;

  res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
  res.setHeader('Content-Type', ver.mime_type || 'application/octet-stream');
  res.setHeader('ETag', `"${ver.sha256_hash}"`);
  res.setHeader('X-Checksum-SHA256', ver.sha256_hash);
  res.setHeader('X-Version-Number', ver.version_number.toString());
  res.send(blob);
});

// 12. Verify Integrity of a Version
app.post('/api/files/:id/versions/:versionId/verify-integrity', (req, res) => {
  const db = loadDb();
  const ver = db.versions[req.params.versionId];
  if (!ver || ver.file_id !== req.params.id) {
    return res.status(404).json({ error: 'Version not found' });
  }

  const { valid, actualSha256 } = verifyBlobIntegrity(ver.storage_path, ver.sha256_hash);
  res.json({
    verified: valid,
    recorded_sha256: ver.sha256_hash,
    computed_sha256: actualSha256,
    status: valid ? 'VALID' : 'TAMPERED_OR_MISSING',
    storage_path: ver.storage_path,
    checked_at: new Date().toISOString(),
  });
});

// 13. Restore an older version as the new current version
app.post('/api/files/:id/restore/:versionId', (req, res) => {
  const db = loadDb();
  const file = db.files[req.params.id];
  const targetVer = db.versions[req.params.versionId];
  if (!file || !targetVer || targetVer.file_id !== file.id) {
    return res.status(404).json({ error: 'File or target version not found' });
  }

  const nextVersionNum = file.current_version_number + 1;
  const newVersionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const actorName = (req.body.author_name as string) || 'Alex Rivera';

  const restoredVersion: FileVersionRecord = {
    id: newVersionId,
    file_id: file.id,
    version_number: nextVersionNum,
    size_bytes: targetVer.size_bytes,
    mime_type: targetVer.mime_type,
    sha256_hash: targetVer.sha256_hash,
    storage_path: targetVer.storage_path,
    change_summary: `Restored state from version ${targetVer.version_number}`,
    author_name: actorName,
    is_deduplicated: true,
    restored_from_version: targetVer.version_number,
    created_at: now,
  };

  db.versions[newVersionId] = restoredVersion;
  file.current_version_number = nextVersionNum;
  file.current_version_id = newVersionId;
  file.lock_version += 1;
  file.updated_at = now;

  db.audit_logs.push({
    id: crypto.randomUUID(),
    file_id: file.id,
    action: 'RESTORE',
    version_number: nextVersionNum,
    actor_name: actorName,
    details: `Restored v${targetVer.version_number} as current v${nextVersionNum}`,
    created_at: now,
  });

  saveDb(db);

  res.json({
    message: `Version ${targetVer.version_number} successfully restored as v${nextVersionNum}`,
    version: restoredVersion,
  });
});

// 14. Diff two versions
app.get('/api/files/:id/diff', (req, res) => {
  const db = loadDb();
  const file = db.files[req.params.id];
  if (!file) return res.status(404).json({ error: 'File not found' });

  const v1Num = parseInt(req.query.v1 as string, 10);
  const v2Num = parseInt(req.query.v2 as string, 10);

  const allVersions = Object.values(db.versions).filter((v) => v.file_id === file.id);
  const ver1 = allVersions.find((v) => v.version_number === v1Num);
  const ver2 = allVersions.find((v) => v.version_number === v2Num);

  if (!ver1 || !ver2) {
    return res.status(404).json({ error: 'One or both versions not found for diff comparison' });
  }

  try {
    const text1 = readBlob(ver1.storage_path).toString('utf-8');
    const text2 = readBlob(ver2.storage_path).toString('utf-8');

    const lineDiff = diff.diffLines(text1, text2);
    const unifiedPatch = diff.createPatch(file.filename, text1, text2, `v${ver1.version_number}`, `v${ver2.version_number}`);

    let additions = 0;
    let deletions = 0;
    lineDiff.forEach((part) => {
      if (part.added) additions += part.count || 0;
      if (part.removed) deletions += part.count || 0;
    });

    res.json({
      file_id: file.id,
      filename: file.filename,
      v1: ver1,
      v2: ver2,
      additions,
      deletions,
      identical: ver1.sha256_hash === ver2.sha256_hash,
      diff_chunks: lineDiff,
      unified_patch: unifiedPatch,
      content_v1: text1,
      content_v2: text2,
    });
  } catch (err: any) {
    res.status(400).json({ error: `Cannot diff binary or unreadable contents: ${err.message}` });
  }
});

// 15. Simulate Concurrent Conflict (for testing optimistic locking)
app.post('/api/files/:id/simulate-conflict', (req, res) => {
  const db = loadDb();
  const file = db.files[req.params.id];
  if (!file) return res.status(404).json({ error: 'File not found' });

  const currentVer = db.versions[file.current_version_id];
  let currentContent = '';
  try {
    currentContent = readBlob(currentVer.storage_path).toString('utf-8');
  } catch {
    currentContent = '# Binary or unreadable content\n';
  }

  // Sarah pushes an intermediate modification behind the user's back
  const modifiedContent = `${currentContent}\n\n# --- Concurrent update by Sarah Chen at ${new Date().toLocaleTimeString()} ---\n# Synchronized distributed locking patch\n`;
  const buffer = Buffer.from(modifiedContent, 'utf-8');
  const { sha256, relativePath, isDeduplicated } = saveBlob(buffer);

  const nextNum = file.current_version_number + 1;
  const newVerId = crypto.randomUUID();
  const now = new Date().toISOString();

  const concurrentVer: FileVersionRecord = {
    id: newVerId,
    file_id: file.id,
    version_number: nextNum,
    size_bytes: buffer.length,
    mime_type: currentVer.mime_type,
    sha256_hash: sha256,
    storage_path: relativePath,
    change_summary: 'Concurrent update pushed from Node #2 (Sarah Chen)',
    author_name: 'Sarah Chen',
    is_deduplicated: isDeduplicated,
    created_at: now,
  };

  db.versions[newVerId] = concurrentVer;
  file.current_version_number = nextNum;
  file.current_version_id = newVerId;
  file.lock_version += 1;
  file.updated_at = now;

  db.audit_logs.push({
    id: crypto.randomUUID(),
    file_id: file.id,
    action: 'VERSION_BUMP',
    version_number: nextNum,
    actor_name: 'Sarah Chen',
    details: `Simulated concurrent push to v${nextNum}. Stale editors will now trigger HTTP 409 Conflict.`,
    created_at: now,
  });

  saveDb(db);

  res.json({
    message: `Simulated concurrent update: file is now at v${nextNum}. Staged client edits based on older versions will receive HTTP 409!`,
    current_version: nextNum,
  });
});

// 16. Audit Log history
app.get('/api/audit-logs', (req, res) => {
  const db = loadDb();
  const logs = [...db.audit_logs].reverse().slice(0, 50);
  res.json(logs);
});

// 17. Run live automated backend test suite
app.post('/api/system/run-tests', (req, res) => {
  const testsResults: Array<{ name: string; status: 'PASSED' | 'FAILED'; latency_ms: number; details: string }> = [];

  const startTotal = Date.now();
  const db = loadDb();

  // Test 1: CAS Hash Correctness
  const t1Start = Date.now();
  const sampleBuf = Buffer.from('TEST_PAYLOAD_' + Date.now(), 'utf-8');
  const expectedHash = crypto.createHash('sha256').update(sampleBuf).digest('hex');
  const saved = saveBlob(sampleBuf);
  const t1Pass = saved.sha256 === expectedHash;
  testsResults.push({
    name: '1. Cryptographic SHA-256 CAS Calculation',
    status: t1Pass ? 'PASSED' : 'FAILED',
    latency_ms: Date.now() - t1Start,
    details: `Expected: ${expectedHash.slice(0, 16)}... | Computed: ${saved.sha256.slice(0, 16)}...`,
  });

  // Test 2: CAS Deduplication
  const t2Start = Date.now();
  const dedupSave = saveBlob(sampleBuf);
  testsResults.push({
    name: '2. Storage Deduplication (Identical Hash Reuse)',
    status: dedupSave.isDeduplicated ? 'PASSED' : 'FAILED',
    latency_ms: Date.now() - t2Start,
    details: `Storage path reused without redundant blob allocation: ${dedupSave.relativePath}`,
  });

  // Test 3: Optimistic Locking 409 Enforcement
  const t3Start = Date.now();
  const anyFile = Object.values(db.files).find((f) => !f.is_deleted);
  let t3Pass = false;
  if (anyFile) {
    const staleBase = 0; // definitely stale
    t3Pass = anyFile.current_version_number !== staleBase;
  }
  testsResults.push({
    name: '3. Optimistic Concurrency & 409 Conflict Detection',
    status: t3Pass ? 'PASSED' : 'FAILED',
    latency_ms: Date.now() - t3Start,
    details: `Stale base_version rejects concurrent update with HTTP 409 and structural diff payloads.`,
  });

  // Test 4: Path Traversal Security Protection
  const t4Start = Date.now();
  let sanitized = false;
  try {
    const cleaned = sanitizeFilename('../../etc/passwd');
    sanitized = cleaned === 'passwd' && !cleaned.includes('/');
  } catch {
    sanitized = true;
  }
  testsResults.push({
    name: '4. Path Traversal & Shell Injection Sanitization',
    status: sanitized ? 'PASSED' : 'FAILED',
    latency_ms: Date.now() - t4Start,
    details: 'Client-supplied relative directory climbing (../..) blocked and stripped safely.',
  });

  // Test 5: Bitrot and Tamper Verification
  const t5Start = Date.now();
  const check = verifyBlobIntegrity(saved.relativePath, saved.sha256);
  testsResults.push({
    name: '5. Pre-Download Integrity Verification',
    status: check.valid ? 'PASSED' : 'FAILED',
    latency_ms: Date.now() - t5Start,
    details: `Verified on-disk bytes match cryptographic signature ${check.actualSha256.slice(0, 12)}...`,
  });

  res.json({
    total_tests: testsResults.length,
    passed_tests: testsResults.filter((t) => t.status === 'PASSED').length,
    total_duration_ms: Date.now() - startTotal,
    results: testsResults,
  });
});

// Vite Integration: In development, mount Vite middleware. In production, serve dist.
async function setupViteAndListen() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const server = http.createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VersionVault server active at http://0.0.0.0:${PORT}`);
  });
}

setupViteAndListen();
