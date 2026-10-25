import React from 'react';
import { HealthStats } from '../types';

interface MetricsBarProps {
  stats: HealthStats | null;
  onRefresh: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({ stats, onRefresh }) => {
  return (
    <div className="bg-[#0b101b] border-b border-slate-800/80 px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-3 md:gap-6 font-mono tabular-nums">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-sans">Active Files</span>
            <span className="text-slate-200 font-semibold">{stats?.active_files_count ?? '—'}</span>
          </div>
          <span className="text-slate-700" aria-hidden="true">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-sans">Tracked Versions</span>
            <span className="text-slate-200 font-semibold">{stats?.total_versions_count ?? '—'}</span>
          </div>
          <span className="text-slate-700" aria-hidden="true">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-sans">CAS Deduplication</span>
            <span className="text-emerald-400 font-semibold">
              {stats ? `${stats.dedup_savings_percent}% saved` : '—'}
            </span>
            <span className="text-slate-500 text-[11px]">({stats?.deduplicated_versions_count ?? 0} reused blobs)</span>
          </div>
          <span className="text-slate-700" aria-hidden="true">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-sans">Storage Engine</span>
            <span className="text-slate-300 font-medium font-sans">SHA-256 CAS</span>
          </div>
          <span className="text-slate-700" aria-hidden="true">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-sans">Concurrency</span>
            <span className="text-indigo-400 font-medium font-sans">Optimistic 409 Locking</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-slate-500 font-mono text-[11px] tabular-nums">
            Total managed: {stats ? formatBytes(stats.total_raw_bytes) : '0 B'}
          </span>
          <button
            onClick={onRefresh}
            className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors underline cursor-pointer"
          >
            Sync State
          </button>
        </div>
      </div>
    </div>
  );
};
