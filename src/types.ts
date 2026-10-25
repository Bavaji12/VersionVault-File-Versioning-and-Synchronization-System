export interface FileVersion {
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

export interface FileItem {
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
  latest_version?: FileVersion | null;
}

export interface ConflictData {
  file_id: string;
  filename: string;
  base_version: number;
  current_server_version: number;
  current_server_author: string;
  current_server_summary: string;
  current_server_timestamp?: string;
  current_server_content?: string;
  client_staged_content?: string;
}

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
  count?: number;
}

export interface DiffResponse {
  file_id: string;
  filename: string;
  v1: FileVersion;
  v2: FileVersion;
  additions: number;
  deletions: number;
  identical: boolean;
  diff_chunks: DiffPart[];
  unified_patch: string;
  content_v1: string;
  content_v2: string;
}

export interface HealthStats {
  status: string;
  engine: string;
  algorithm: string;
  active_files_count: number;
  total_versions_count: number;
  unique_storage_blobs: number;
  total_raw_bytes: number;
  deduplicated_versions_count: number;
  dedup_savings_percent: number;
  optimistic_locking_enabled: boolean;
  server_time: string;
}

export interface AuditLog {
  id: string;
  file_id: string;
  action: 'UPLOAD' | 'VERSION_BUMP' | 'RESTORE' | 'CONFLICT_DETECTED' | 'DELETE' | 'RENAME';
  version_number?: number;
  actor_name: string;
  details: string;
  created_at: string;
}

export interface IntegrityResult {
  verified: boolean;
  recorded_sha256: string;
  computed_sha256: string;
  status: string;
  storage_path: string;
  checked_at: string;
}

export interface TestSuiteResult {
  total_tests: number;
  passed_tests: number;
  total_duration_ms: number;
  results: Array<{
    name: string;
    status: 'PASSED' | 'FAILED';
    latency_ms: number;
    details: string;
  }>;
}

export interface ActiveUser {
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
}
