import { useState, useEffect, useRef, useCallback } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { format } from 'date-fns';
import {
  Trash2,
  Link as LinkIcon,
  File,
  X,
  Upload,
  ExternalLink,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Inquiry, uploadsApi } from '../lib/api';
import { useInquiriesStore } from '../stores/inquiries';

interface InquiryEditorProps {
  inquiry: Inquiry;
}

export default function InquiryEditor({ inquiry }: InquiryEditorProps) {
  const { updateInquiry, deleteInquiry, addResource, deleteResource, isSaving } =
    useInquiriesStore();

  const [title, setTitle] = useState(inquiry.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [content, setContent] = useState(inquiry.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddResource, setShowAddResource] = useState(false);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const saveTimeoutRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync content when inquiry changes
  useEffect(() => {
    setTitle(inquiry.title);
    setContent(inquiry.content);
    setSavingStatus('idle');
  }, [inquiry.id, inquiry.title, inquiry.content]);

  // Auto-save content with debounce
  useEffect(() => {
    if (content === inquiry.content) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSavingStatus('saving');

    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        await updateInquiry(inquiry.id, { content });
        setSavingStatus('saved');
        setTimeout(() => setSavingStatus('idle'), 2000);
      } catch {
        setSavingStatus('idle');
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [content, inquiry.id, inquiry.content, updateInquiry]);

  // Focus title input when editing
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleSave = async () => {
    setIsEditingTitle(false);
    if (title.trim() && title !== inquiry.title) {
      await updateInquiry(inquiry.id, { title: title.trim() });
    } else {
      setTitle(inquiry.title);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setTitle(inquiry.title);
      setIsEditingTitle(false);
    }
  };

  const handleDelete = async () => {
    await deleteInquiry(inquiry.id);
    setShowDeleteConfirm(false);
  };

  const handleDeleteResource = async (resourceId: string) => {
    await deleteResource(inquiry.id, resourceId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-charcoal-200">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="input text-xl font-semibold"
                maxLength={200}
              />
            ) : (
              <h1
                className="text-xl font-semibold text-charcoal-900 cursor-pointer hover:text-charcoal-700 truncate"
                onClick={() => setIsEditingTitle(true)}
                title="Click to edit"
              >
                {inquiry.title}
              </h1>
            )}
            <div className="mt-1 flex items-center gap-4 text-sm text-charcoal-500">
              <span>Created {format(new Date(inquiry.createdAt), 'MMM d, yyyy')}</span>
              <span>Updated {format(new Date(inquiry.updatedAt), 'MMM d, yyyy h:mm a')}</span>
              {savingStatus === 'saving' && (
                <span className="flex items-center gap-1 text-charcoal-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              {savingStatus === 'saved' && (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-ghost text-charcoal-500 hover:text-red-600"
            title="Delete inquiry"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto p-4" data-color-mode="light">
        <MDEditor
          value={content}
          onChange={(value) => setContent(value || '')}
          height="100%"
          preview="live"
          visibleDragbar={false}
        />
      </div>

      {/* Resources Section */}
      <div className="border-t border-charcoal-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-charcoal-900">
            Resources ({inquiry.resources.length})
          </h2>
          <button
            onClick={() => setShowAddResource(true)}
            className="btn-secondary text-sm"
          >
            Add Resource
          </button>
        </div>

        {inquiry.resources.length > 0 ? (
          <div className="space-y-2">
            {inquiry.resources.map((resource) => (
              <div
                key={resource.id}
                className="group flex items-center gap-3 p-3 rounded-lg border border-charcoal-200 hover:border-charcoal-300 transition-colors"
              >
                {resource.type === 'link' ? (
                  <LinkIcon className="w-4 h-4 text-charcoal-500 flex-shrink-0" />
                ) : (
                  <File className="w-4 h-4 text-charcoal-500 flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-charcoal-900 truncate">
                    {resource.title}
                  </div>
                  {resource.type === 'link' && resource.url && (
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-charcoal-500 hover:text-charcoal-700 flex items-center gap-1 truncate"
                    >
                      {resource.url}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  )}
                  {resource.type === 'file' && resource.filename && (
                    <a
                      href={uploadsApi.getUrl(resource.filename)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-charcoal-500 hover:text-charcoal-700 flex items-center gap-1"
                    >
                      {resource.filename}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  )}
                </div>

                <button
                  onClick={() => handleDeleteResource(resource.id)}
                  className="opacity-0 group-hover:opacity-100 btn-ghost p-1 text-charcoal-400 hover:text-red-600 transition-opacity"
                  title="Delete resource"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-charcoal-500 text-sm">
            No resources added yet. Click "Add Resource" to attach links or files.
          </p>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          isDeleting={isSaving}
        />
      )}

      {/* Add Resource Modal */}
      {showAddResource && (
        <AddResourceModal
          inquiryId={inquiry.id}
          onClose={() => setShowAddResource(false)}
          onAdd={addResource}
        />
      )}
    </div>
  );
}

interface DeleteConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

function DeleteConfirmModal({ onConfirm, onCancel, isDeleting }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="card p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-charcoal-900 mb-2">
          Delete Inquiry
        </h2>
        <p className="text-charcoal-600 mb-6">
          Are you sure you want to delete this inquiry? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="btn-secondary"
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn-danger"
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddResourceModalProps {
  inquiryId: string;
  onClose: () => void;
  onAdd: (
    inquiryId: string,
    resource: {
      type: 'link' | 'file';
      title: string;
      url?: string;
      filename?: string;
      mimeType?: string;
    }
  ) => Promise<unknown>;
}

function AddResourceModal({ inquiryId, onClose, onAdd }: AddResourceModalProps) {
  const [type, setType] = useState<'link' | 'file'>('link');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setError('');
    setFile(selectedFile);

    // Auto-fill title from filename if empty
    if (!title) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(nameWithoutExt);
    }

    // Upload file
    setIsUploading(true);
    try {
      const result = await uploadsApi.upload(selectedFile);
      setUploadedFilename(result.filename);
      setMimeType(result.mimeType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
      setFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (type === 'link') {
      try {
        new URL(url);
      } catch {
        setError('Please enter a valid URL');
        return;
      }
    }

    if (type === 'file' && !uploadedFilename) {
      setError('Please upload a file');
      return;
    }

    setIsAdding(true);
    try {
      await onAdd(inquiryId, {
        type,
        title: title.trim(),
        url: type === 'link' ? url : undefined,
        filename: type === 'file' ? uploadedFilename : undefined,
        mimeType: type === 'file' ? mimeType : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add resource');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-charcoal-900">
            Add Resource
          </h2>
          <button
            onClick={onClose}
            className="btn-ghost p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Toggle */}
          <div className="flex rounded-lg border border-charcoal-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setType('link')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                type === 'link'
                  ? 'bg-charcoal-900 text-white'
                  : 'bg-white text-charcoal-600 hover:bg-charcoal-50'
              }`}
            >
              <LinkIcon className="w-4 h-4 inline-block mr-2" />
              Link
            </button>
            <button
              type="button"
              onClick={() => setType('file')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                type === 'file'
                  ? 'bg-charcoal-900 text-white'
                  : 'bg-white text-charcoal-600 hover:bg-charcoal-50'
              }`}
            >
              <File className="w-4 h-4 inline-block mr-2" />
              File
            </button>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="resourceTitle" className="label">
              Title
            </label>
            <input
              id="resourceTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="Enter a title"
              required
            />
          </div>

          {/* Link URL */}
          {type === 'link' && (
            <div>
              <label htmlFor="resourceUrl" className="label">
                URL
              </label>
              <input
                id="resourceUrl"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="input"
                placeholder="https://example.com"
                required
              />
            </div>
          )}

          {/* File Upload */}
          {type === 'file' && (
            <div>
              <label className="label">File</label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  file
                    ? 'border-green-300 bg-green-50'
                    : 'border-charcoal-300 hover:border-charcoal-400'
                }`}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-charcoal-400" />
                    <span className="text-sm text-charcoal-500">Uploading...</span>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center gap-2">
                    <Check className="w-8 h-8 text-green-600" />
                    <span className="text-sm font-medium text-charcoal-900">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setUploadedFilename('');
                        setMimeType('');
                      }}
                      className="text-sm text-charcoal-500 hover:text-charcoal-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-charcoal-400" />
                    <span className="text-sm text-charcoal-500">
                      Drag and drop or{' '}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-charcoal-700 underline"
                      >
                        browse
                      </button>
                    </span>
                    <span className="text-xs text-charcoal-400">
                      PDF, Word, text, markdown, images (max 10MB)
                    </span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) {
                      handleFileSelect(selectedFile);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={isAdding}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isAdding || isUploading}
            >
              {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
