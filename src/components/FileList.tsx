import React, { useState } from 'react';
import {
  Search,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Download,
  History,
  Trash2,
  Edit2,
  Copy,
  Check,
  AlertTriangle,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';
import { FileItem, ActiveUser } from '../types';

interface FileListProps {
  files: FileItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string;
  setSelectedCategory: (c: string) => void;
  sortBy: string;
  setSortBy: (s: string) => void;
  sortDir: 'asc' | 'desc';
  setSortDir: (d: 'asc' | 'desc') => void;
  onSelectFile: (file: FileItem) => void;
  onRenameFile: (file: FileItem) => void;
  onDeleteFile: (file: FileItem) => void;
  onSimulateConflict: (file: FileItem) => void;
  onOpenUpload: () => void;
  currentUser: ActiveUser;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getFileIcon(filename: string, category: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['py', 'ts', 'tsx', 'js', 'sql', 'html', 'css', 'rs', 'go'].includes(ext || '')) {
    return <FileCode className="w-4 h-4 text-cyan-400" />;
  }
  if (['md', 'txt', 'pdf', 'doc'].includes(ext || '')) {
    return <FileText className="w-4 h-4 text-blue-400" />;
  }
  if (['json', 'yml', 'yaml', 'toml', 'env'].includes(ext || '')) {
    return <FileJson className="w-4 h-4 text-amber-400" />;
  }
  if (['csv', 'tsv', 'xlsx'].includes(ext || '')) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
  }
  return <File className="w-4 h-4 text-slate-400" />;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  total,
  page,
  totalPages,
  onPageChange,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  onSelectFile,
  onRenameFile,
  onDeleteFile,
  onSimulateConflict,
  onOpenUpload,
}) => {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleDownload = (file: FileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!file.current_version_id) return;
    const downloadUrl = `/api/files/${file.id}/versions/${file.current_version_id}/download`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', file.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const categories = [
    { id: 'all', label: 'All Files' },
    { id: 'code', label: 'Code' },
    { id: 'docs', label: 'Documents' },
    { id: 'config', label: 'Configs' },
    { id: 'data', label: 'Data' },
  ];

  return (
    <div className="space-y-4">
      {/* Search, Filter Bar and Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Category Filter segmented control */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                selectedCategory === c.id
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by filename, extension, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Files Table / Data Grid */}
      <div className="bg-[#0f1523] border border-slate-800 rounded-lg overflow-hidden shadow-xs">
        {files.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <UploadCloud className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-300">No matching files in repository</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? `No files match query "${searchQuery}". Clear filters or upload a new file.`
                : 'Your VersionVault repository is currently empty. Upload your first file or script to begin version tracking.'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={onOpenUpload}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-500 transition-colors cursor-pointer"
              >
                Upload First File
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-900/50 text-slate-400 font-medium">
                  <th
                    onClick={() => toggleSort('name')}
                    className="py-3 px-4 cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>File Name</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('versions')}
                    className="py-3 px-3 cursor-pointer hover:text-slate-200 select-none whitespace-nowrap text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Version</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                  <th className="py-3 px-3 select-none whitespace-nowrap">
                    <span>SHA-256 Fingerprint</span>
                  </th>
                  <th
                    onClick={() => toggleSort('size')}
                    className="py-3 px-3 cursor-pointer hover:text-slate-200 select-none whitespace-nowrap text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Size</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('updated_at')}
                    className="py-3 px-4 cursor-pointer hover:text-slate-200 select-none whitespace-nowrap text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Last Modified</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {files.map((file) => {
                  const latestVer = file.latest_version;
                  const sha = latestVer?.sha256_hash || '';

                  return (
                    <tr
                      key={file.id}
                      onClick={() => onSelectFile(file)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* Name & Description */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="shrink-0">{getFileIcon(file.filename, file.category)}</div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-200 group-hover:text-indigo-300 transition-colors truncate max-w-xs md:max-w-md">
                              {file.filename}
                            </div>
                            {file.description && (
                              <div className="text-[11px] text-slate-500 truncate max-w-xs md:max-w-sm mt-0.5">
                                {file.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Current Version */}
                      <td className="py-3 px-3 text-center">
                        <span className="font-mono tabular-nums font-semibold text-indigo-400">
                          v{file.current_version_number}
                        </span>
                      </td>

                      {/* SHA-256 Checksum */}
                      <td className="py-3 px-3">
                        {sha ? (
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400 tabular-nums">
                            <span>{sha.slice(0, 10)}...</span>
                            <button
                              onClick={(e) => handleCopyHash(sha, e)}
                              title="Copy full SHA-256 checksum"
                              className="p-1 hover:text-white rounded text-slate-500 transition-colors"
                            >
                              {copiedHash === sha ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            {latestVer?.is_deduplicated && (
                              <span
                                title="Storage deduplication: Blob shared with matching hash"
                                className="text-[10px] text-emerald-500 font-sans ml-1"
                              >
                                [CAS Reused]
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Size */}
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                        {formatBytes(latestVer?.size_bytes || 0)}
                      </td>

                      {/* Last Modified & Author */}
                      <td className="py-3 px-4 text-right">
                        <div className="text-slate-300 font-mono tabular-nums">
                          {new Date(file.updated_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {latestVer?.author_name || 'System'}
                        </div>
                      </td>

                      {/* Action buttons */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect History & Diff */}
                          <button
                            onClick={() => onSelectFile(file)}
                            title="Inspect version history, line diff, and edit"
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Download current version */}
                          <button
                            onClick={(e) => handleDownload(file, e)}
                            title="Download verified version"
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Simulate Concurrent Conflict button */}
                          <button
                            onClick={() => onSimulateConflict(file)}
                            title="Simulate concurrent update by Sarah Chen to test 409 Conflict detection"
                            className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 rounded transition-colors cursor-pointer"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </button>

                          {/* Rename */}
                          <button
                            onClick={() => onRenameFile(file)}
                            title="Rename file metadata"
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => onDeleteFile(file)}
                            title="Soft delete file to retention trash"
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination & Status Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/80 bg-slate-900/40 text-xs text-slate-400">
          <div className="font-mono tabular-nums">
            Showing {files.length} of {total} files
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="p-1 rounded border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono tabular-nums text-slate-300">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-1 rounded border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
