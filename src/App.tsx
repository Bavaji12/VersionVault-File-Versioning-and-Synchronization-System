/**
 * VersionVault - Enterprise File Versioning and Synchronization System
 */

import React, { useState, useEffect } from 'react';
import {
  FileItem,
  HealthStats,
  ActiveUser,
  ConflictData,
} from './types';
import { api, ApiError } from './api';
import { TopBar } from './components/TopBar';
import { MetricsBar } from './components/MetricsBar';
import { FileList } from './components/FileList';
import { UploadModal } from './components/UploadModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { ConflictModal } from './components/ConflictModal';
import { StorageIntegrityView } from './components/StorageIntegrityView';
import { ArchitectureView } from './components/ArchitectureView';
import {
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle2,
  FileCode,
  GitCommit,
  SplitSquareVertical,
  Layers,
  ArrowRight,
} from 'lucide-react';

const TEAM_USERS: ActiveUser[] = [
  {
    name: 'Alex Rivera',
    email: 'alex.rivera@versionvault.internal',
    role: 'Lead Architect',
    avatarUrl: '/src/assets/images/avatar_engineer_lead_1792967594701.jpg',
  },
  {
    name: 'Sarah Chen',
    email: 'sarah.chen@versionvault.internal',
    role: 'Distributed Systems',
  },
  {
    name: 'Marcus Vance',
    email: 'marcus.vance@versionvault.internal',
    role: 'DevOps & Reliability',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'files' | 'history' | 'conflict' | 'storage' | 'architecture'>('files');
  const [currentUser, setCurrentUser] = useState<ActiveUser>(TEAM_USERS[0]);

  // Files state
  const [files, setFiles] = useState<FileItem[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [stats, setStats] = useState<HealthStats | null>(null);

  // Selected file for History Modal
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Conflict state & modal
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);
  const [isConflictOpen, setIsConflictOpen] = useState(false);

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [newFilename, setNewFilename] = useState('');

  // Fetch files
  const loadFiles = async () => {
    try {
      const res = await api.getFiles({
        query: searchQuery,
        category: selectedCategory,
        page,
        limit,
        sortBy,
        sortDir,
      });
      setFiles(res.items);
      setTotalFiles(res.total);
      setTotalPages(res.total_pages);
    } catch (err) {
      console.error('Failed to load files', err);
    }
  };

  // Fetch stats
  const loadStats = async () => {
    try {
      const s = await api.getHealth();
      setStats(s);
    } catch (err) {
      console.error('Failed to load health stats', err);
    }
  };

  useEffect(() => {
    loadFiles();
    loadStats();
  }, [page, searchQuery, selectedCategory, sortBy, sortDir]);

  // Handlers
  const handleSelectFile = (file: FileItem) => {
    setSelectedFile(file);
    setIsHistoryOpen(true);
  };

  const handleUploadSubmit = async (formData: FormData) => {
    await api.uploadFile(formData);
    await loadFiles();
    await loadStats();
  };

  const handleDirectCreateText = async (data: {
    filename: string;
    content: string;
    description: string;
    category: string;
    author_name: string;
    change_summary: string;
  }) => {
    await api.createFileWithText(data);
    await loadFiles();
    await loadStats();
  };

  const handleDeleteFile = async (file: FileItem) => {
    const confirm = window.confirm(`Move '${file.filename}' to 30-day retention trash?`);
    if (!confirm) return;

    try {
      await api.deleteFile(file.id, false, currentUser.name);
      await loadFiles();
      await loadStats();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleOpenRename = (file: FileItem) => {
    setRenameTarget(file);
    setNewFilename(file.filename);
  };

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !newFilename.trim()) return;

    try {
      await api.renameFile(renameTarget.id, { filename: newFilename.trim() });
      setRenameTarget(null);
      await loadFiles();
    } catch (err: any) {
      alert(`Rename failed: ${err.message}`);
    }
  };

  const handleSimulateConflict = async (file: FileItem) => {
    try {
      const res = await api.simulateConflict(file.id);
      await loadFiles();
      await loadStats();

      // Trigger interactive conflict flow
      setConflictData({
        file_id: file.id,
        filename: file.filename,
        base_version: file.current_version_number,
        current_server_version: res.current_version,
        current_server_author: 'Sarah Chen',
        current_server_summary: 'Concurrent update pushed from Node #2',
        current_server_content: `"""Current server state (v${res.current_version})"""\n# Updated by Sarah Chen\nimport asyncio\nimport redis.asyncio as redis\n\nasync def sync():\n    print("Optimistic lock state verified")\n`,
        client_staged_content: `"""Your staged edits (Based on v${file.current_version_number})"""\n# Written by ${currentUser.name}\ndef sync():\n    print("My custom client changes awaiting merge")\n`,
      });
      setIsConflictOpen(true);
    } catch (err: any) {
      alert(`Failed to simulate conflict: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* 3-Zone Top Navigation Contract */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        onOpenUpload={() => setIsUploadOpen(true)}
        usersList={TEAM_USERS}
      />

      {/* Unboxed Metadata & Metric Strip */}
      <MetricsBar stats={stats} onRefresh={() => { loadFiles(); loadStats(); }} />

      {/* Main Viewport Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'files' && (
          <FileList
            files={files}
            total={totalFiles}
            page={page}
            limit={limit}
            totalPages={totalPages}
            onPageChange={(p) => setPage(p)}
            searchQuery={searchQuery}
            setSearchQuery={(q) => { setSearchQuery(q); setPage(1); }}
            selectedCategory={selectedCategory}
            setSelectedCategory={(c) => { setSelectedCategory(c); setPage(1); }}
            sortBy={sortBy}
            setSortBy={setSortBy}
            sortDir={sortDir}
            setSortDir={setSortDir}
            onSelectFile={handleSelectFile}
            onRenameFile={handleOpenRename}
            onDeleteFile={handleDeleteFile}
            onSimulateConflict={handleSimulateConflict}
            onOpenUpload={() => setIsUploadOpen(true)}
            currentUser={currentUser}
          />
        )}

        {/* Tab 2: Timeline & Diffs */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="bg-[#0f1523] border border-slate-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
                <GitCommit className="w-4 h-4 text-indigo-400" />
                <span>Version History & Diff Hub</span>
              </h2>
              <p className="text-xs text-slate-400">
                Select an active repository artifact to inspect version timeline, compute line-by-line diffs,
                verify cryptographic SHA-256 signatures, and test in-app edits.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => handleSelectFile(file)}
                  className="bg-[#0f1523] border border-slate-800 hover:border-indigo-500/60 rounded-lg p-4 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-semibold text-indigo-400 tabular-nums">
                      v{file.current_version_number}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {file.latest_version?.author_name || 'Engineer'}
                    </span>
                  </div>

                  <h3 className="font-medium text-slate-200 group-hover:text-indigo-300 transition-colors text-sm truncate">
                    {file.filename}
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                    {file.description || file.latest_version?.change_summary || 'No changelog description'}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
                    <span>{file.latest_version?.sha256_hash.slice(0, 8)}...</span>
                    <span className="text-indigo-400 group-hover:underline">Open Timeline & Diff →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Interactive Conflict Lab */}
        {activeTab === 'conflict' && (
          <div className="space-y-6">
            <div className="bg-[#0f1523] border border-slate-800 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Distributed Concurrency & 409 Conflict Simulation Lab
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                    In multi-user repositories, two engineers often modify the same file concurrently.
                    VersionVault uses <strong>optimistic locking</strong> with client-supplied <code className="text-indigo-300 font-mono text-[11px]">base_version</code> tokens.
                    If the server version advances while a client is drafting edits, VersionVault halts the operation with a structured <strong>HTTP 409 Conflict</strong> response,
                    preventing accidental overwrites and launching a side-by-side reconciliation interface.
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive Simulation Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {files.slice(0, 4).map((file) => (
                <div key={file.id} className="bg-[#0f1523] border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-mono text-indigo-400 font-semibold tabular-nums">
                        Current: v{file.current_version_number}
                      </span>
                      <span className="text-slate-500 font-mono">ID: {file.id.slice(0, 8)}</span>
                    </div>

                    <h3 className="font-semibold text-slate-200 text-sm">{file.filename}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {file.description || 'Core synchronization artifact'}
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-mono">Base target: v{file.current_version_number}</span>
                    <button
                      onClick={() => handleSimulateConflict(file)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-amber-600/90 hover:bg-amber-500 text-white transition-colors cursor-pointer shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Simulate Conflict Collision</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Storage & Integrity View */}
        {activeTab === 'storage' && (
          <StorageIntegrityView stats={stats} onRefreshStats={loadStats} />
        )}

        {/* Tab 5: Architecture & API Tests */}
        {activeTab === 'architecture' && <ArchitectureView />}
      </main>

      {/* MODAL 1: Version History & Diff Inspector */}
      {selectedFile && (
        <VersionHistoryModal
          file={selectedFile}
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          onRefreshFile={() => {
            loadFiles();
            loadStats();
          }}
          currentUser={currentUser}
          onTriggerConflict={(data) => {
            setConflictData(data);
            setIsConflictOpen(true);
          }}
        />
      )}

      {/* MODAL 2: 409 Conflict Resolution Center */}
      <ConflictModal
        conflict={conflictData}
        isOpen={isConflictOpen}
        onClose={() => setIsConflictOpen(false)}
        onResolved={() => {
          loadFiles();
          loadStats();
        }}
        currentUser={currentUser}
      />

      {/* MODAL 3: File Upload & Creation */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUpload={handleUploadSubmit}
        onDirectCreateText={handleDirectCreateText}
        currentUser={currentUser}
      />

      {/* MODAL 4: Rename File Metadata */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-[#0f172a] border border-slate-800 rounded-xl w-full max-w-md p-5 shadow-xl animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-semibold text-white mb-1">Rename File</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter new filename. Version history and cryptographic hashes are preserved.
            </p>

            <form onSubmit={handleConfirmRename} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Filename</label>
                <input
                  type="text"
                  value={newFilename}
                  onChange={(e) => setNewFilename(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-500 cursor-pointer"
                >
                  Save Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
