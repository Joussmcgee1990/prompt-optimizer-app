"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FileUploadProps {
  onUpload: (files: File[]) => Promise<void>;
  accept?: string;
  uploading?: boolean;
}

export default function FileUpload({
  onUpload,
  accept = ".md,.txt,.pdf",
  uploading = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) await onUpload(files);
    },
    [onUpload]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) await onUpload(files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onUpload]
  );

  return (
    <motion.div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`
        relative cursor-pointer rounded-[20px] border-2 border-dashed p-10
        flex flex-col items-center justify-center gap-4 transition-all duration-300
        ${isDragging
          ? "border-accent bg-accent/5 scale-[1.01]"
          : "border-border hover:border-muted bg-card"
        }
        ${uploading ? "pointer-events-none opacity-60" : ""}
      `}
      whileHover={{ scale: uploading ? 1 : 1.005 }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />

      <AnimatePresence mode="wait">
        {uploading ? (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted">Uploading...</span>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="w-14 h-14 rounded-full bg-card-lighter flex items-center justify-center">
              <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white">
                Drop files here or <span className="text-accent">browse</span>
              </p>
              <p className="text-xs text-muted mt-1">
                Supports .md, .txt, and .pdf files
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
