import React, { useState, useRef } from 'react';
import { X, Upload, FileText, AlertCircle } from 'lucide-react';
import { ActiveUser } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (formData: FormData) => Promise<void>;
  onDirectCreateText: (data: {
    filename: string;
    content: string;
    description: string;
    category: string;
    author_name: string;
    change_summary: string;
  }) => Promise<void>;
  currentUser: ActiveUser;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  onDirectCreateText,
  currentUser,
}) => {
  const [tab, setTab] = useState<'upload' | 'create'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('code');
  const [changeSummary, setChangeSummary] = useState('Initial version upload');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (file: File) => {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const disallowed = ['.exe', '.bat', '.cmd', '.vbs', '.msi', '.dll'];
    if (disallowed.includes(ext)) {
      setError(`Files with ${ext} extension are blocked for security.`);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File exceeds maximum size of 50 MB.');
      return;
    }

    setError(null);
    setSelectedFile(file);
    if (!description) {
      setDescription(`Uploaded ${file.name}`);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (tab === 'upload') {
        if (!selectedFile) {
          setError('Please select a file to upload.');
          setIsSubmitting(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('description', description);
        formData.append('category', category);
        formData.append('author_name', currentUser.name);
        formData.append('change_summary', changeSummary);

        await onUpload(formData);
      } else {
        if (!filename.trim()) {
          setError('Please specify a filename.');
          setIsSubmitting(false);
          return;
        }
        await onDirectCreateText({
          filename: filename.trim(),
          content,
          description,
          category,
          author_name: currentUser.name,
          change_summary: changeSummary,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload file.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Upload to VersionVault</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode selector */}
        <div className="flex border-b border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`flex-1 py-2.5 font-medium transition-colors cursor-pointer ${
              tab === 'upload'
                ? 'text-white border-b-2 border-indigo-500 bg-slate-900/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Upload File from Disk
          </button>
          <button
            type="button"
            onClick={() => setTab('create')}
            className={`flex-1 py-2.5 font-medium transition-colors cursor-pointer ${
              tab === 'create'
                ? 'text-white border-b-2 border-indigo-500 bg-slate-900/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create New Text / Code File
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-950/40 border border-rose-800/60 rounded text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {tab === 'upload' ? (
            <div>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  dragActive
                    ? 'border-indigo-500 bg-indigo-950/20'
                    : selectedFile
                    ? 'border-emerald-500/60 bg-emerald-950/10'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                  className="hidden"
                />
                <Upload className="w-7 h-7 mx-auto mb-2 text-slate-400" />
                {selectedFile ? (
                  <div>
                    <p className="text-xs font-semibold text-emerald-400">{selectedFile.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {(selectedFile.size / 1024).toFixed(1)} KB · Ready to hash
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-medium text-slate-300">
                      Drag & drop a file here, or click to browse
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Max 50 MB · All types supported (except restricted executables)
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Filename with extension
                </label>
                <input
                  type="text"
                  placeholder="e.g. database_migration.sql or service.py"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  File Content
                </label>
                <textarea
                  rows={5}
                  placeholder="Write initial code or text content..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono focus:outline-none focus:border-indigo-500 resize-y"
                />
              </div>
            </div>
          )}

          {/* Metadata inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="code">Code & Scripts</option>
                <option value="docs">Documentation</option>
                <option value="config">Configurations</option>
                <option value="data">Data & Tables</option>
                <option value="other">General / Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Author</label>
              <input
                type="text"
                value={currentUser.name}
                disabled
                className="w-full px-3 py-1.5 text-xs bg-slate-900/60 border border-slate-800 rounded text-slate-400 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Core synchronization worker configuration"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Change Summary / Commit Note
            </label>
            <input
              type="text"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Hashing & Persisting...' : 'Upload & Create v1'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
