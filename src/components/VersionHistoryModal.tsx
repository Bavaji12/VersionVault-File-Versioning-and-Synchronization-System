import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  Download,
  RotateCcw,
  ShieldCheck,
  SplitSquareVertical,
  Code2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Send,
  GitCommit,
} from 'lucide-react';
import { FileItem, FileVersion, DiffResponse, ActiveUser } from '../types';
import { api, ApiError } from '../api';

interface VersionHistoryModalProps {
  file: FileItem;
  isOpen: boolean;
  onClose: () => void;
  onRefreshFile: () => void;
  currentUser: ActiveUser;
  onTriggerConflict: (conflictData: any) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  file,
  isOpen,
  onClose,
  onRefreshFile,
  currentUser,
  onTriggerConflict,
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'diff' | 'editor'>('timeline');
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<FileVersion | null>(null);
  const [versionContent, setVersionContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // Diff state
  const [diffV1, setDiffV1] = useState<number>(1);
  const [diffV2, setDiffV2] = useState<number>(1);
  const [diffData, setDiffData] = useState<DiffResponse | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  // Editor state
  const [editedContent, setEditedContent] = useState<string>('');
  const [changeSummary, setChangeSummary] = useState<string>('Refactored implementation');
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [identicalNotice, setIdenticalNotice] = useState<string | null>(null);

  // Integrity Check state
  const [integrityStatus, setIntegrityStatus] = useState<{
    versionId: string;
    verified: boolean;
    computed_sha256: string;
    status: string;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedSha, setCopiedSha] = useState(false);

  // Load versions
  const loadVersions = async () => {
    try {
      const vers = await api.getVersions(file.id);
      setVersions(vers);
      if (vers.length > 0) {
        const latest = vers[0];
        setSelectedVersion(latest);
        if (vers.length >= 2) {
          setDiffV1(vers[1].version_number);
          setDiffV2(vers[0].version_number);
        } else {
          setDiffV1(vers[0].version_number);
          setDiffV2(vers[0].version_number);
        }
      }
    } catch (err) {
      console.error('Failed to load version history', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadVersions();
      setIntegrityStatus(null);
    }
  }, [isOpen, file.id]);

  // Load selected version content
  useEffect(() => {
    if (!selectedVersion) return;
    setIsLoadingContent(true);
    api
      .getVersionDetails(file.id, selectedVersion.id)
      .then((data) => {
        setVersionContent(data.content_preview);
        if (selectedVersion.version_number === file.current_version_number) {
          setEditedContent(data.content_preview || '');
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setIsLoadingContent(false));
  }, [selectedVersion, file.id]);

  // Load Diff
  const fetchDiff = async (v1: number, v2: number) => {
    setIsLoadingDiff(true);
    try {
      const data = await api.getDiff(file.id, v1, v2);
      setDiffData(data);
    } catch (err: any) {
      console.error('Diff error', err);
      setDiffData(null);
    } finally {
      setIsLoadingDiff(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'diff' && diffV1 && diffV2) {
      fetchDiff(diffV1, diffV2);
    }
  }, [activeTab, diffV1, diffV2]);

  if (!isOpen) return null;

  // Restore action
  const handleRestore = async (version: FileVersion) => {
    const confirm = window.confirm(
      `Restore version ${version.version_number}? This will append a new version (${file.current_version_number + 1}) matching v${version.version_number} while retaining full audit history.`
    );
    if (!confirm) return;

    try {
      await api.restoreVersion(file.id, version.id, currentUser.name);
      await loadVersions();
      onRefreshFile();
      alert(`Version ${version.version_number} restored successfully as current version.`);
    } catch (err: any) {
      alert(`Restore failed: ${err.message}`);
    }
  };

  // Integrity Check
  const handleVerifyIntegrity = async (version: FileVersion) => {
    setIsVerifying(true);
    try {
      const res = await api.verifyIntegrity(file.id, version.id);
      setIntegrityStatus({
        versionId: version.id,
        verified: res.verified,
        computed_sha256: res.computed_sha256,
        status: res.status,
      });
    } catch (err: any) {
      setIntegrityStatus({
        versionId: version.id,
        verified: false,
        computed_sha256: 'ERROR',
        status: err.message,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Commit from in-app editor
  const handleCommitEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCommitting(true);
    setCommitError(null);
    setIdenticalNotice(null);

    try {
      const res = await api.commitNewVersionText(file.id, {
        content: editedContent,
        base_version: file.current_version_number,
        author_name: currentUser.name,
        change_summary: changeSummary || 'Updated file in web editor',
      });

      if (res.identical_content_warning) {
        setIdenticalNotice(res.identical_content_warning);
      }

      await loadVersions();
      onRefreshFile();
      setActiveTab('timeline');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409 && err.conflict) {
        // Concurrency Conflict Detected!
        onClose();
        onTriggerConflict({
          ...err.conflict,
          client_staged_content: editedContent,
        });
      } else {
        setCommitError(err.message || 'Failed to push new version');
      }
    } finally {
      setIsCommitting(false);
    }
  };

  const handleSimulateConflictHere = async () => {
    try {
      await api.simulateConflict(file.id);
      onRefreshFile();
      alert(
        `Simulated concurrent update by Sarah Chen! File is now bumped on the server. If you attempt to commit based on v${file.current_version_number}, a 409 Conflict will be triggered!`
      );
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCopySha = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-xs">
      <div className="bg-[#0b101c] border border-slate-800 rounded-xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 rounded bg-indigo-950/60 text-indigo-400 border border-indigo-800/40 shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white truncate">{file.filename}</h2>
                <span className="font-mono text-xs text-indigo-400 tabular-nums">
                  Current: v{file.current_version_number}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                {file.description || 'Versioned repository artifact'}
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs shrink-0">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-colors cursor-pointer ${
                activeTab === 'timeline'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>Timeline ({versions.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('diff')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-colors cursor-pointer ${
                activeTab === 'diff'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SplitSquareVertical className="w-3.5 h-3.5" />
              <span>Compare & Diff</span>
            </button>
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-colors cursor-pointer ${
                activeTab === 'editor'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Live Editor</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer ml-3 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex">
          {/* TAB 1: TIMELINE & VERSION INSPECTOR */}
          {activeTab === 'timeline' && (
            <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
              {/* Left Column: Timeline List */}
              <div className="w-full md:w-80 border-r border-slate-800/80 overflow-y-auto bg-slate-900/30 shrink-0">
                <div className="p-3 border-b border-slate-800/60 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Version History
                </div>
                <div className="divide-y divide-slate-800/50">
                  {versions.map((ver) => {
                    const isSelected = selectedVersion?.id === ver.id;
                    const isLatest = ver.version_number === file.current_version_number;

                    return (
                      <div
                        key={ver.id}
                        onClick={() => {
                          setSelectedVersion(ver);
                          setIntegrityStatus(null);
                        }}
                        className={`p-3.5 text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-950/40 border-l-2 border-indigo-500 text-white'
                            : 'hover:bg-slate-800/40 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-mono tabular-nums">
                            <span className="font-bold text-indigo-400">v{ver.version_number}</span>
                            {isLatest && (
                              <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-1.5 py-0.2 rounded font-sans">
                                Current
                              </span>
                            )}
                            {ver.restored_from_version && (
                              <span className="text-[10px] text-amber-400 font-sans">
                                [Restored v{ver.restored_from_version}]
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {formatBytes(ver.size_bytes)}
                          </span>
                        </div>

                        <div className="mt-1 font-medium text-slate-200 line-clamp-1">
                          {ver.change_summary || 'No changelog description'}
                        </div>

                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                          <span className="truncate max-w-[120px]">{ver.author_name}</span>
                          <span>
                            {new Date(ver.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Version Inspector & Preview */}
              <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0d121f]">
                {selectedVersion ? (
                  <>
                    {/* Version Metadata Header */}
                    <div className="p-4 border-b border-slate-800/80 bg-slate-900/40 shrink-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-base font-bold text-white tabular-nums">
                              Version {selectedVersion.version_number}
                            </span>
                            <span className="text-xs text-slate-400">by {selectedVersion.author_name}</span>
                            <span className="text-slate-600">·</span>
                            <span className="text-xs text-slate-400 font-mono tabular-nums">
                              {new Date(selectedVersion.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 mt-1">
                            {selectedVersion.change_summary || 'Initial repository commit'}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {/* Integrity Verification Action */}
                          <button
                            onClick={() => handleVerifyIntegrity(selectedVersion)}
                            disabled={isVerifying}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-700 bg-slate-800 text-slate-200 hover:text-white transition-colors cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                            <span>{isVerifying ? 'Verifying Hash...' : 'Verify Cryptographic Integrity'}</span>
                          </button>

                          {/* Restore older version button */}
                          {selectedVersion.version_number !== file.current_version_number && (
                            <button
                              onClick={() => handleRestore(selectedVersion)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer shadow-sm"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restore as Current (v{file.current_version_number + 1})</span>
                            </button>
                          )}

                          {/* Download version */}
                          <a
                            href={`/api/files/${file.id}/versions/${selectedVersion.id}/download`}
                            download
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-700 bg-slate-800 text-slate-200 hover:text-white transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download v{selectedVersion.version_number}</span>
                          </a>
                        </div>
                      </div>

                      {/* Cryptographic SHA-256 fingerprint strip */}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs bg-black/40 border border-slate-800/80 p-2 rounded font-mono">
                        <span className="text-slate-500 font-sans">SHA-256 Checksum:</span>
                        <span className="text-slate-300 text-[11px] break-all select-all">
                          {selectedVersion.sha256_hash}
                        </span>
                        <button
                          onClick={() => handleCopySha(selectedVersion.sha256_hash)}
                          className="p-1 text-slate-400 hover:text-white transition-colors"
                        >
                          {copiedSha ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>

                        {selectedVersion.is_deduplicated && (
                          <span className="text-emerald-400 text-[11px] font-sans">
                            [Deduplicated: Reuses storage blob]
                          </span>
                        )}
                      </div>

                      {/* Integrity Verification Result Banner */}
                      {integrityStatus && integrityStatus.versionId === selectedVersion.id && (
                        <div
                          className={`mt-2.5 p-2.5 rounded text-xs flex items-center justify-between border ${
                            integrityStatus.verified
                              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                              : 'bg-rose-950/40 border-rose-800 text-rose-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {integrityStatus.verified ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            )}
                            <div>
                              <span className="font-semibold">
                                {integrityStatus.verified
                                  ? '100% Cryptographic Match Verified'
                                  : 'Integrity Check Failed!'}
                              </span>
                              <span className="ml-2 font-mono text-[11px]">
                                On-disk hash matches recorded database hash ({integrityStatus.computed_sha256.slice(0, 16)}...)
                              </span>
                            </div>
                          </div>
                          <span className="font-mono text-[11px] uppercase">{integrityStatus.status}</span>
                        </div>
                      )}
                    </div>

                    {/* Preview Area */}
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-300 bg-[#070b13]">
                      {isLoadingContent ? (
                        <div className="text-slate-500 py-10 text-center">Reading file blob from storage...</div>
                      ) : versionContent !== null ? (
                        <pre className="whitespace-pre-wrap leading-relaxed select-text font-mono text-xs">
                          {versionContent}
                        </pre>
                      ) : (
                        <div className="text-slate-500 py-12 text-center">
                          <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                          <p>Binary or non-text file preview unavailable.</p>
                          <p className="text-[11px] text-slate-600 mt-1">
                            Click "Download v{selectedVersion.version_number}" to inspect the binary file locally.
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                    Select a version to inspect
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DIFF COMPARISON */}
          {activeTab === 'diff' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0d121f]">
              {/* Diff Controls Header */}
              <div className="p-3.5 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400 font-medium">Compare:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-rose-400 font-mono">Base (v1):</span>
                    <select
                      value={diffV1}
                      onChange={(e) => setDiffV1(parseInt(e.target.value, 10))}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.version_number}>
                          v{v.version_number} ({v.author_name})
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-slate-600">→</span>

                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-mono">Target (v2):</span>
                    <select
                      value={diffV2}
                      onChange={(e) => setDiffV2(parseInt(e.target.value, 10))}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.version_number}>
                          v{v.version_number} ({v.author_name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Diff Stats */}
                {diffData && (
                  <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                    <span className="text-emerald-400">+{diffData.additions} lines</span>
                    <span className="text-rose-400">-{diffData.deletions} lines</span>
                    {diffData.identical && (
                      <span className="text-amber-400">[Content Identical]</span>
                    )}
                  </div>
                )}
              </div>

              {/* Diff Body */}
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-[#070a12]">
                {isLoadingDiff ? (
                  <div className="text-slate-500 py-10 text-center">Calculating Myers line-by-line diff...</div>
                ) : diffData ? (
                  <div className="space-y-0.5 border border-slate-800/80 rounded overflow-hidden">
                    {diffData.diff_chunks.map((chunk, idx) => {
                      let bg = 'bg-transparent text-slate-300';
                      let sign = ' ';
                      if (chunk.added) {
                        bg = 'bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500';
                        sign = '+';
                      } else if (chunk.removed) {
                        bg = 'bg-rose-950/40 text-rose-300 border-l-2 border-rose-500';
                        sign = '-';
                      }

                      return (
                        <div key={idx} className={`px-3 py-1 font-mono text-xs whitespace-pre-wrap ${bg}`}>
                          {chunk.value.split('\n').filter((l, i, arr) => i < arr.length - 1 || l.length > 0).map((line, lIdx) => (
                            <div key={lIdx} className="flex">
                              <span className="w-5 select-none text-slate-600 shrink-0">{sign}</span>
                              <span className="select-text">{line}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-slate-500 py-10 text-center">
                    Select two text versions above to compute diff comparison.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LIVE IN-APP CODE/TEXT EDITOR */}
          {activeTab === 'editor' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0f1d]">
              <form onSubmit={handleCommitEditor} className="flex-1 flex flex-col h-full">
                {/* Editor Top Bar with Concurrency Controls */}
                <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-300 font-mono">
                      Staging edits for: <strong className="text-white">{file.filename}</strong>
                    </span>
                    <span className="text-xs text-indigo-400 font-mono tabular-nums">
                      (Base: v{file.current_version_number})
                    </span>
                  </div>

                  {/* Simulate Conflict Tool button */}
                  <button
                    type="button"
                    onClick={handleSimulateConflictHere}
                    title="Simulate someone else modifying this file concurrently to test optimistic locking"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-amber-800/80 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 transition-colors cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Simulate Concurrent Background Push</span>
                  </button>
                </div>

                {commitError && (
                  <div className="p-3 bg-rose-950/40 border-b border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{commitError}</span>
                  </div>
                )}

                {identicalNotice && (
                  <div className="p-3 bg-amber-950/40 border-b border-amber-800 text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{identicalNotice}</span>
                  </div>
                )}

                {/* Text Editor Textarea */}
                <div className="flex-1 p-2 bg-[#060a12] overflow-hidden">
                  <textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    placeholder="Enter file contents..."
                    className="w-full h-full p-3 font-mono text-xs bg-transparent text-slate-200 focus:outline-none resize-none leading-relaxed"
                  />
                </div>

                {/* Commit Footer */}
                <div className="p-3.5 border-t border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2 flex-1 max-w-md">
                    <span className="text-xs text-slate-400 whitespace-nowrap">Changelog:</span>
                    <input
                      type="text"
                      placeholder="e.g. Added caching layer, fixed concurrency edge case"
                      value={changeSummary}
                      onChange={(e) => setChangeSummary(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                    <span>Author: {currentUser.name}</span>
                    <button
                      type="submit"
                      disabled={isCommitting}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-500 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isCommitting ? 'Committing...' : `Commit Version ${file.current_version_number + 1}`}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
