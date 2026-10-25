import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  HardDrive,
  Database,
  Trash2,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Layers,
  Activity,
} from 'lucide-react';
import { HealthStats, FileItem, AuditLog, FileVersion } from '../types';
import { api } from '../api';

interface StorageIntegrityViewProps {
  stats: HealthStats | null;
  onRefreshStats: () => void;
}

export const StorageIntegrityView: React.FC<StorageIntegrityViewProps> = ({
  stats,
  onRefreshStats,
}) => {
  const [deletedFiles, setDeletedFiles] = useState<FileItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditResults, setAuditResults] = useState<{
    totalChecked: number;
    passed: number;
    failed: number;
    items: Array<{ file_id: string; version_number: number; hash: string; status: string }>;
  } | null>(null);

  const loadDeletedFiles = async () => {
    try {
      const res = await api.getFiles({ include_deleted: true });
      const trashed = res.items.filter((f) => f.is_deleted);
      setDeletedFiles(trashed);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const logs = await api.getAuditLogs();
      setAuditLogs(logs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadDeletedFiles();
    loadAuditLogs();
  }, []);

  const handleRestoreFile = async (file: FileItem) => {
    try {
      await api.restoreDeletedFile(file.id);
      loadDeletedFiles();
      onRefreshStats();
      alert(`File '${file.filename}' restored from trash to active repository.`);
    } catch (err: any) {
      alert(`Failed to restore: ${err.message}`);
    }
  };

  const handlePurgeFile = async (file: FileItem) => {
    const confirm = window.confirm(
      `Permanently purge '${file.filename}' and all its versions from disk? This cannot be undone.`
    );
    if (!confirm) return;

    try {
      await api.deleteFile(file.id, true);
      loadDeletedFiles();
      onRefreshStats();
    } catch (err: any) {
      alert(`Failed to purge: ${err.message}`);
    }
  };

  const handleRunGlobalAudit = async () => {
    setAuditRunning(true);
    setAuditResults(null);
    try {
      const filesRes = await api.getFiles({ limit: 100 });
      let totalChecked = 0;
      let passed = 0;
      let failed = 0;
      const verifiedList: Array<{
        file_id: string;
        version_number: number;
        hash: string;
        status: string;
      }> = [];

      for (const file of filesRes.items) {
        const versions = await api.getVersions(file.id);
        for (const ver of versions) {
          totalChecked++;
          const res = await api.verifyIntegrity(file.id, ver.id);
          if (res.verified) {
            passed++;
          } else {
            failed++;
          }
          verifiedList.push({
            file_id: file.filename,
            version_number: ver.version_number,
            hash: ver.sha256_hash,
            status: res.status,
          });
        }
      }

      setAuditResults({
        totalChecked,
        passed,
        failed,
        items: verifiedList,
      });
    } catch (err: any) {
      alert(`Audit failed: ${err.message}`);
    } finally {
      setAuditRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: CAS Architecture */}
        <div className="bg-[#0f1523] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center gap-2.5 text-xs text-slate-400 font-medium mb-2">
            <HardDrive className="w-4 h-4 text-indigo-400" />
            <span>Content-Addressable Storage (CAS)</span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-white">
            {stats?.unique_storage_blobs ?? 0} Blobs
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Addressing on-disk blobs by SHA-256 hash shards (<code className="text-indigo-300 font-mono text-[11px]">/blobs/ab/cd/&#123;hash&#125;</code>)
            ensuring tamper-evident immutability.
          </p>
        </div>

        {/* Card 2: Deduplication Savings */}
        <div className="bg-[#0f1523] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center gap-2.5 text-xs text-slate-400 font-medium mb-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Deduplication Storage Savings</span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-400">
            {stats?.dedup_savings_percent ?? 0}% Storage Saved
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {stats?.deduplicated_versions_count ?? 0} versions share identical storage blobs without duplicate allocation
            on disk.
          </p>
        </div>

        {/* Card 3: Integrity Engine */}
        <div className="bg-[#0f1523] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center gap-2.5 text-xs text-slate-400 font-medium mb-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Cryptographic Verification</span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-cyan-300">
            SHA-256 Active
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pre-download checksum validation streams and on-demand bitrot audit.
          </p>
        </div>
      </div>

      {/* Global Storage Integrity Auditor */}
      <div className="bg-[#0f1523] border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-cyan-400" />
              <span>Full Repository Cryptographic Integrity Auditor</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Recalculates cryptographic SHA-256 signatures for every physical blob on disk and validates against
              the database ledger.
            </p>
          </div>

          <button
            onClick={handleRunGlobalAudit}
            disabled={auditRunning}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded transition-colors cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${auditRunning ? 'animate-spin' : ''}`} />
            <span>{auditRunning ? 'Auditing On-Disk Blobs...' : 'Run Global Integrity Audit'}</span>
          </button>
        </div>

        {/* Audit Results */}
        {auditResults && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
              <span className="text-emerald-400 flex items-center gap-1.5 font-sans font-semibold">
                <CheckCircle2 className="w-4 h-4" /> {auditResults.passed} of {auditResults.totalChecked} Versions Verified Clean
              </span>
              {auditResults.failed > 0 && (
                <span className="text-rose-400 flex items-center gap-1.5 font-sans font-semibold">
                  <AlertCircle className="w-4 h-4" /> {auditResults.failed} Corrupted or Missing
                </span>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto border border-slate-800 rounded divide-y divide-slate-800/60 bg-[#070a12] text-xs font-mono">
              {auditResults.items.map((item, idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-slate-200">{item.file_id}</span>
                    <span className="text-indigo-400">v{item.version_number}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    <span>{item.hash.slice(0, 16)}...</span>
                    <span className="text-emerald-400 font-bold uppercase">{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Retention Policy & Trashed Files */}
      <div className="bg-[#0f1523] border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
          <Trash2 className="w-4 h-4 text-rose-400" />
          <span>30-Day Retention Trash & Recovery</span>
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Soft-deleted items are safely quarantined according to retention policy. You can restore them anytime or
          permanently purge disk artifacts.
        </p>

        {deletedFiles.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded">
            Trash is empty. All active files are safely tracked.
          </div>
        ) : (
          <div className="border border-slate-800 rounded overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                  <th className="py-2.5 px-3">Filename</th>
                  <th className="py-2.5 px-3">Deleted At</th>
                  <th className="py-2.5 px-3">Versions Kept</th>
                  <th className="py-2.5 px-3 text-right">Recovery Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {deletedFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-medium text-slate-200">{file.filename}</td>
                    <td className="py-2.5 px-3 text-slate-400 font-mono">
                      {file.deleted_at ? new Date(file.deleted_at).toLocaleString() : 'Recently'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-indigo-400">{file.current_version_number}</td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRestoreFile(file)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                        <button
                          onClick={() => handlePurgeFile(file)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-900/80 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Purge</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Log Stream */}
      <div className="bg-[#0f1523] border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-indigo-400" />
          <span>System Audit Trail Ledger</span>
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Append-only tamper-resistant log of repository transactions, version promotions, and conflict resolutions.
        </p>

        <div className="max-h-64 overflow-y-auto border border-slate-800 rounded divide-y divide-slate-800/50 bg-[#070b13] text-xs font-mono">
          {auditLogs.map((log) => (
            <div key={log.id} className="p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    log.action === 'UPLOAD'
                      ? 'bg-blue-950 text-blue-400 border border-blue-800'
                      : log.action === 'VERSION_BUMP'
                      ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                      : log.action === 'RESTORE'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}
                >
                  {log.action}
                </span>
                <span className="text-slate-300">{log.details}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-500 text-[11px] shrink-0">
                <span>{log.actor_name}</span>
                <span>{new Date(log.created_at).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
