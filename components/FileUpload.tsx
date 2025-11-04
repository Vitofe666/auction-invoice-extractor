
import React, { useState, useCallback } from 'react';
import { UploadCloudIcon } from './icons';

interface FileUploadProps {
  onFileSelect: (file: File | File[]) => void;
  disabled: boolean;
  multiple?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled, multiple = false }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (multiple) {
        onFileSelect(Array.from(e.dataTransfer.files));
      } else {
        onFileSelect(e.dataTransfer.files[0]);
      }
    }
  }, [disabled, onFileSelect, multiple]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File input changed:', e.target.files);
    if (e.target.files && e.target.files.length > 0) {
      if (multiple) {
        console.log('Multiple files selected:', Array.from(e.target.files));
        onFileSelect(Array.from(e.target.files));
      } else {
        console.log('Single file selected:', e.target.files[0]);
        onFileSelect(e.target.files[0]);
      }
    }
  };

  const dragDropClasses = isDragging ? 'border-cyan-400 bg-gray-700' : 'border-gray-600';

  return (
    <label
      htmlFor="file-upload"
      className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-300 ${dragDropClasses} ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-cyan-500 hover:bg-gray-700/50'}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
        <UploadCloudIcon className={`w-10 h-10 mb-3 ${isDragging ? 'text-cyan-300' : 'text-gray-400'}`} />
        <p className="mb-2 text-sm text-gray-400">
          <span className="font-semibold text-cyan-400">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-gray-500">
          {multiple ? 'Multiple files supported - ' : ''}PDF, PNG, JPG, GIF up to 10MB{multiple ? ' each' : ''}
        </p>
      </div>
      <input 
        id="file-upload" 
        type="file" 
        className="hidden"
        multiple={multiple} 
        onChange={handleFileChange} 
        accept="image/png, image/jpeg, image/gif, application/pdf" 
        disabled={disabled}
      />
    </label>
  );
};

export default FileUpload;