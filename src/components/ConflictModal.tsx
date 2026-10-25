import React, { useState } from 'react';
import {
  AlertTriangle,
  X,
  ArrowRight,
  GitMerge,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { ConflictData, ActiveUser } from '../types';
import { api } from '../api';

interface ConflictModalProps {
  conflict: ConflictData | null;
  isOpen: boolean;
  onClose: () => void;
  onResolved: () => void;
  currentUser: ActiveUser;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  conflict,
  isOpen,
  onClose,
  onResolved,
  currentUser,
}) => {
  const [resolutionMode, setResolutionMode] = useState<'view' | 'merge'>('view');
  const [mergedText, setMergedText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !conflict) return null;

  // Initialize merged text if not set
  const initialMerge = () => {
    const header = `# --- CONFLICT RESOLUTION MERGE FOR ${conflict.filename} ---\n`;
    const clientSection = `# >>> YOUR LOCAL CHANGES (Base: v${conflict.base_version})\n${conflict.client_staged_content || ''}\n`;
    const serverSection = `# === SERVER CURRENT (v${conflict.current_server_version} by ${conflict.current_server_author})\n${conflict.current_server_content || ''}\n# <<<\n`;
    setMergedText(header + clientSection + serverSection);
    setResolutionMode('merge');
  };

  // Strategy 1: Overwrite server
  const handleForceOverwrite = async () => {
    const confirm = window.confirm(
      `Are you sure you want to force-overwrite? This will push your draft as v${conflict.current_server_version + 1}, superseding ${conflict.current_server_author}'s changes (full history is preserved).`
    );
    if (!confirm) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await api.commitNewVersionText(conflict.file_id, {
        content: conflict.client_staged_content || '',
        base_version: conflict.current_server_version,
        override_conflict: true,
        author_name: currentUser.name,
        change_summary: `Conflict resolved via force-overwrite (superseded v${conflict.current_server_version})`,
      });
      onResolved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to force overwrite');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Strategy 2: Discard and pull latest
  const handleDiscardAndPull = () => {
    onResolved();
    onClose();
  };

  // Strategy 3: Commit merged text
  const handleCommitMerged = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await api.commitNewVersionText(conflict.file_id, {
        content: mergedText,
        base_version: conflict.current_server_version,
        override_conflict: true,
        author_name: currentUser.name,
        change_summary: `Conflict merged: integrated v${conflict.base_version} with v${conflict.current_server_version}`,
      });
      onResolved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to commit merged version');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-xs">
      <div className="bg-[#0e1424] border border-amber-600/80 rounded-xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Conflict Alert Banner */}
        <div className="p-4 bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-b border-amber-700/60 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  HTTP 409 CONFLICT
                </span>
                <h2 className="text-sm font-semibold text-white">
                  Concurrent Update Collision in <span className="font-mono">{conflict.filename}</span>
                </h2>
              </div>
              <p className="text-xs text-amber-200/90 mt-1">
                You attempted to commit based on <strong className="font-mono">v{conflict.base_version}</strong>, but the
                server was already updated to <strong className="font-mono">v{conflict.current_server_version}</strong> by{' '}
                <strong>{conflict.current_server_author}</strong> ({conflict.current_server_summary || 'No summary'}).
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/60 border-b border-rose-800 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Conflict Resolution Workspace */}
        {resolutionMode === 'view' ? (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left: Your Staged Version */}
            <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-slate-800/80 bg-slate-950/60 overflow-hidden">
              <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-mono text-cyan-400 font-semibold">
                  <FileText className="w-4 h-4" />
                  <span>Your Staged Draft (Base: v{conflict.base_version})</span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">By {currentUser.name}</span>
              </div>
              <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-cyan-200/90 bg-[#070b14]">
                <pre className="whitespace-pre-wrap leading-relaxed select-text">
                  {conflict.client_staged_content || '(Empty content)'}
                </pre>
              </div>
            </div>

            {/* Right: Current Server Version */}
            <div className="flex-1 flex flex-col bg-slate-950/60 overflow-hidden">
              <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-mono text-amber-400 font-semibold">
                  <FileText className="w-4 h-4" />
                  <span>Current Server Head (v{conflict.current_server_version})</span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">By {conflict.current_server_author}</span>
              </div>
              <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-amber-200/90 bg-[#070b14]">
                <pre className="whitespace-pre-wrap leading-relaxed select-text">
                  {conflict.current_server_content || '(Empty content)'}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          /* Interactive 3-way Merge Editor */
          <div className="flex-1 flex flex-col overflow-hidden bg-[#070b14]">
            <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">
                Interactive Resolution Editor — Edit and reconcile both versions:
              </span>
              <button
                onClick={() => setResolutionMode('view')}
                className="text-slate-400 hover:text-white underline cursor-pointer"
              >
                Back to side-by-side view
              </button>
            </div>
            <div className="flex-1 p-2 overflow-hidden">
              <textarea
                value={mergedText}
                onChange={(e) => setMergedText(e.target.value)}
                className="w-full h-full p-3 font-mono text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none resize-none leading-relaxed"
              />
            </div>
          </div>
        )}

        {/* Resolution Actions Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Resolution Strategy:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Strategy 2: Discard and pull */}
            <button
              onClick={handleDiscardAndPull}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Discard My Edits & Pull Latest (v{conflict.current_server_version})</span>
            </button>

            {/* Strategy 3: Interactive Merge */}
            {resolutionMode === 'view' ? (
              <button
                onClick={initialMerge}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded border border-indigo-700 bg-indigo-950/50 text-indigo-300 hover:bg-indigo-900/50 transition-colors cursor-pointer"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>Open Merge Editor</span>
              </button>
            ) : (
              <button
                onClick={handleCommitMerged}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Saving Merge...' : `Commit Merged (as v${conflict.current_server_version + 1})`}</span>
              </button>
            )}

            {/* Strategy 1: Force Overwrite */}
            <button
              onClick={handleForceOverwrite}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-sm"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Overwriting...' : 'Force Overwrite (Create v' + (conflict.current_server_version + 1) + ')'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
