import React from 'react';
import { HardDrive, Upload, UserCheck } from 'lucide-react';
import { ActiveUser } from '../types';

interface TopBarProps {
  activeTab: 'files' | 'history' | 'conflict' | 'storage' | 'architecture';
  setActiveTab: (tab: 'files' | 'history' | 'conflict' | 'storage' | 'architecture') => void;
  currentUser: ActiveUser;
  setCurrentUser: (user: ActiveUser) => void;
  onOpenUpload: () => void;
  usersList: ActiveUser[];
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  setCurrentUser,
  onOpenUpload,
  usersList,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-[#0d131f]/95 backdrop-blur-md sticky top-0 z-40">
      {/* Zone 1: Brand title, one line wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-sm">
          <HardDrive className="w-4 h-4" />
        </div>
        <span
          onClick={() => setActiveTab('files')}
          className="text-lg font-bold tracking-tight text-white cursor-pointer whitespace-nowrap select-none"
        >
          VersionVault
        </span>
      </div>

      {/* Zone 2: 4-5 nav links, 1-2 word labels, single-line */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
        <button
          onClick={() => setActiveTab('files')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-1 cursor-pointer ${
            activeTab === 'files' ? 'text-white border-b-2 border-indigo-500 font-semibold' : ''
          }`}
        >
          Files
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-1 cursor-pointer ${
            activeTab === 'history' ? 'text-white border-b-2 border-indigo-500 font-semibold' : ''
          }`}
        >
          Timeline & Diff
        </button>
        <button
          onClick={() => setActiveTab('conflict')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-1 cursor-pointer ${
            activeTab === 'conflict' ? 'text-white border-b-2 border-indigo-500 font-semibold' : ''
          }`}
        >
          Conflict Lab
        </button>
        <button
          onClick={() => setActiveTab('storage')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-1 cursor-pointer ${
            activeTab === 'storage' ? 'text-white border-b-2 border-indigo-500 font-semibold' : ''
          }`}
        >
          CAS & Integrity
        </button>
        <button
          onClick={() => setActiveTab('architecture')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-1 cursor-pointer ${
            activeTab === 'architecture' ? 'text-white border-b-2 border-indigo-500 font-semibold' : ''
          }`}
        >
          Architecture & Tests
        </button>
      </nav>

      {/* Zone 3: 1 primary action + actor switch */}
      <div className="flex items-center gap-3 shrink-0">
        {/* User profile / simulation actor switcher */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-slate-800 bg-slate-900/60 text-xs text-slate-300">
          <div className="relative w-6 h-6 rounded-full overflow-hidden bg-slate-700 shrink-0 border border-slate-600">
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-[10px] text-slate-200">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <select
            value={currentUser.name}
            onChange={(e) => {
              const selected = usersList.find((u) => u.name === e.target.value);
              if (selected) setCurrentUser(selected);
            }}
            aria-label="Active user"
            className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
          >
            {usersList.map((u) => (
              <option key={u.email} value={u.name} className="bg-slate-900 text-slate-200">
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>

        {/* Primary Action Button */}
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm active:scale-95"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload File</span>
        </button>
      </div>
    </header>
  );
};
