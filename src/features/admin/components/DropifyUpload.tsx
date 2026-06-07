import React, { useRef, useState } from 'react';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { adminApi } from '../api/adminApi';

interface DropifyUploadProps {
  value?: string | string[]; // current url(s)
  onChange?: (url: string) => void;
  onFileSelect?: (file: File) => void;
  onFilesSelect?: (files: File[]) => void;
  multiple?: boolean;
  maxFiles?: number;
  onError?: (err: string) => void;
  label?: string;
  maxSizeMB?: number;
  allowedTypes?: string[];
}

export function DropifyUpload({
  value,
  onChange,
  onFileSelect,
  onFilesSelect,
  multiple = false,
  maxFiles = 10,
  onError,
  label = 'Upload Image',
  maxSizeMB = 10,
  allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
}: DropifyUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    if (onError) onError(msg);
  };

  const handleFiles = async (files: FileList) => {
    setErrorMsg('');
    const selectedList = Array.from(files);
    if (selectedList.length === 0) return;

    // 1. Validation: Mimetypes
    const invalidType = selectedList.find(f => !allowedTypes.includes(f.type));
    if (invalidType) {
      triggerError('Invalid file type. Only PNG, JPG, JPEG, and WEBP are allowed.');
      return;
    }

    // 2. Validation: File size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const invalidSize = selectedList.find(f => f.size > maxSizeBytes);
    if (invalidSize) {
      triggerError(`File "${invalidSize.name}" exceeds the ${maxSizeMB}MB limit.`);
      return;
    }

    // Mode A: Multiple File Select (e.g. Worker Portfolio)
    if (multiple) {
      if (onFilesSelect) {
        onFilesSelect(selectedList.slice(0, maxFiles));
      }
      return;
    }

    const file = selectedList[0];

    // Mode B: Single Raw File Select (e.g. Worker Profile Pic)
    if (onFileSelect) {
      onFileSelect(file);
      return;
    }

    // Mode C: Direct Upload (e.g. Admin modules)
    if (onChange) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('image', file);

        const res = await adminApi.post<{ success: boolean; image: string }>(
          adminApi.endpoints.uploadImageAsset,
          formData
        );

        if (res.success && res.image) {
          onChange(res.image);
        } else {
          triggerError('Failed to upload image. No URL returned.');
        }
      } catch (err: any) {
        triggerError(err.message || 'An error occurred during upload.');
      } finally {
        setUploading(false);
      }
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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onChange) onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const showSinglePreview = !multiple && typeof value === 'string' && value;

  return (
    <div className="admin-field admin-field--wide">
      <span>{label}</span>
      <div
        className={`admin-dropzone ${dragActive ? 'admin-dropzone--active' : ''} ${showSinglePreview ? 'admin-dropzone--has-file' : ''} ${uploading ? 'admin-dropzone--uploading' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={allowedTypes.join(',')}
          onChange={handleChange}
          disabled={uploading}
          multiple={multiple}
        />

        {uploading ? (
          <div className="admin-dropzone-state">
            <Loader2 className="animate-spin text-[var(--admin-primary)]" size={32} />
            <p>Uploading image asset...</p>
          </div>
        ) : showSinglePreview ? (
          <div className="admin-dropzone-preview">
            <img src={value as string} alt="Upload preview" />
            <div className="admin-dropzone-overlay">
              <div className="admin-dropzone-overlay-actions">
                <button
                  type="button"
                  className="admin-dropzone-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Change Image
                </button>
                <button
                  type="button"
                  className="admin-dropzone-btn admin-dropzone-btn--danger"
                  onClick={handleRemove}
                >
                  <X size={14} /> Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="admin-dropzone-state">
            <UploadCloud size={32} />
            <p className="admin-dropzone-title">
              {multiple ? 'Drag & drop photos here, or ' : 'Drag & drop your image here, or '}
              <span>browse</span>
            </p>
            <p className="admin-dropzone-subtitle">
              Supports PNG, JPG or WEBP (Max {maxSizeMB}MB{multiple ? `, up to ${maxFiles} photos` : ''})
            </p>
          </div>
        )}
      </div>
      {errorMsg && <p className="admin-dropzone-error">{errorMsg}</p>}
    </div>
  );
}
