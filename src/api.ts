import {
  FileItem,
  FileVersion,
  ConflictData,
  DiffResponse,
  HealthStats,
  IntegrityResult,
  TestSuiteResult,
  AuditLog,
} from './types';

export class ApiError extends Error {
  status: number;
  data: any;
  conflict?: ConflictData;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    if (status === 409 && data?.conflict) {
      this.conflict = data.conflict;
    }
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `Request failed with status ${res.status}`;
    throw new ApiError(errorMsg, res.status, data);
  }
  return data as T;
}

export const api = {
  // Health & Stats
  getHealth: () => request<HealthStats>('/api/health'),

  // Files
  getFiles: (params?: {
    query?: string;
    category?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortDir?: string;
    include_deleted?: boolean;
  }) => {
    const queryParts: string[] = [];
    if (params?.query) queryParts.push(`query=${encodeURIComponent(params.query)}`);
    if (params?.category) queryParts.push(`category=${encodeURIComponent(params.category)}`);
    if (params?.page) queryParts.push(`page=${params.page}`);
    if (params?.limit) queryParts.push(`limit=${params.limit}`);
    if (params?.sortBy) queryParts.push(`sortBy=${params.sortBy}`);
    if (params?.sortDir) queryParts.push(`sortDir=${params.sortDir}`);
    if (params?.include_deleted) queryParts.push(`include_deleted=true`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return request<{ items: FileItem[]; total: number; page: number; limit: number; total_pages: number }>(
      `/api/files${qs}`
    );
  },

  getFile: (id: string) =>
    request<{ file: FileItem; latest_version: FileVersion | null; total_versions: number }>(
      `/api/files/${id}`
    ),

  uploadFile: (formData: FormData) =>
    request<FileItem>('/api/files', {
      method: 'POST',
      body: formData,
    }),

  createFileWithText: (body: {
    filename: string;
    content: string;
    description?: string;
    category?: string;
    author_name?: string;
    change_summary?: string;
  }) =>
    request<FileItem>('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  renameFile: (id: string, body: { filename: string; description?: string; category?: string }) =>
    request<{ message: string; file: FileItem }>(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  deleteFile: (id: string, purge: boolean = false, actor: string = 'Alex Rivera') =>
    request<{ message: string }>(`/api/files/${id}?purge=${purge}&actor=${encodeURIComponent(actor)}`, {
      method: 'DELETE',
    }),

  restoreDeletedFile: (id: string) =>
    request<{ message: string; file: FileItem }>(`/api/files/${id}/restore-file`, {
      method: 'POST',
    }),

  // Versions
  getVersions: (fileId: string) => request<FileVersion[]>(`/api/files/${fileId}/versions`),

  getVersionDetails: (fileId: string, versionId: string) =>
    request<{ version: FileVersion; is_text: boolean; content_preview: string | null }>(
      `/api/files/${fileId}/versions/${versionId}`
    ),

  uploadNewVersion: (fileId: string, formData: FormData) =>
    request<{ version: FileVersion; identical_content_warning?: string }>(`/api/files/${fileId}/versions`, {
      method: 'POST',
      body: formData,
    }),

  commitNewVersionText: (
    fileId: string,
    body: {
      content: string;
      base_version: number;
      override_conflict?: boolean;
      change_summary?: string;
      author_name?: string;
    }
  ) =>
    request<{ version: FileVersion; identical_content_warning?: string }>(`/api/files/${fileId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  restoreVersion: (fileId: string, versionId: string, authorName: string = 'Alex Rivera') =>
    request<{ message: string; version: FileVersion }>(`/api/files/${fileId}/restore/${versionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_name: authorName }),
    }),

  verifyIntegrity: (fileId: string, versionId: string) =>
    request<IntegrityResult>(`/api/files/${fileId}/versions/${versionId}/verify-integrity`, {
      method: 'POST',
    }),

  getDiff: (fileId: string, v1: number, v2: number) =>
    request<DiffResponse>(`/api/files/${fileId}/diff?v1=${v1}&v2=${v2}`),

  simulateConflict: (fileId: string) =>
    request<{ message: string; current_version: number }>(`/api/files/${fileId}/simulate-conflict`, {
      method: 'POST',
    }),

  // Audit Logs & Testing
  getAuditLogs: () => request<AuditLog[]>('/api/audit-logs'),

  runTestSuite: () =>
    request<TestSuiteResult>('/api/system/run-tests', {
      method: 'POST',
    }),
};
