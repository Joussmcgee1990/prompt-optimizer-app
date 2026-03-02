"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  getProject,
  listDocuments,
  uploadDocuments,
  deleteDocument,
  loadData,
  type Project,
  type DocumentInfo,
} from "@/lib/api";
import FileUpload from "@/components/file-upload";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([
        getProject(projectId),
        listDocuments(projectId),
      ]);
      setProject(p);
      setDocuments(d.documents);

      // If loading, keep polling
      if (p.kb_status === "loading") {
        setBuilding(true);
      } else {
        setBuilding(false);
      }
    } catch (err) {
      console.error("Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Poll when building
  useEffect(() => {
    if (building) {
      const interval = setInterval(loadAll, 2000);
      setPollInterval(interval);
      return () => clearInterval(interval);
    } else if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
  }, [building, loadAll]);

  const handleUpload = async (files: File[]) => {
    setUploading(true);
    try {
      await uploadDocuments(projectId, files);
      await loadAll();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      await deleteDocument(projectId, filename);
      setDocuments((prev) => prev.filter((d) => d.filename !== filename));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleBuild = async () => {
    setBuilding(true);
    try {
      await loadData(projectId);
    } catch (err) {
      console.error("Build failed:", err);
      setBuilding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-2xl font-bold text-white">Upload Documents</h1>
        <p className="text-sm text-muted mt-1">
          Upload your knowledge base files. These will be indexed and used by the
          RAG system.
        </p>
      </div>

      {/* Upload Zone */}
      <FileUpload onUpload={handleUpload} uploading={uploading} />

      {/* Document List */}
      {documents.length > 0 && (
        <div className="bg-card rounded-[20px] border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-white">
              {documents.length} file{documents.length !== 1 ? "s" : ""} uploaded
            </span>
          </div>
          <div className="divide-y divide-border">
            <AnimatePresence>
              {documents.map((doc) => (
                <motion.div
                  key={doc.filename}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between px-5 py-3 hover:bg-card-lighter transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-white">{doc.filename}</p>
                      <p className="text-xs text-muted">{formatSize(doc.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.filename)}
                    className="text-muted hover:text-error transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Knowledge Base Status */}
      <div className="bg-card rounded-[20px] p-6 border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {project?.kb_status === "ready" ? (
              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : building ? (
              <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-warning border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-card-lighter flex items-center justify-center">
                <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-white">
                {project?.kb_status === "ready"
                  ? `Knowledge Base Ready (${project.kb_doc_count} documents indexed)`
                  : building
                    ? "Building knowledge base..."
                    : "Knowledge base not built yet"}
              </p>
              <p className="text-xs text-muted">
                {project?.kb_status === "ready"
                  ? "Your documents are indexed and ready for querying."
                  : building
                    ? "This may take a moment depending on document size."
                    : "Upload documents and click Build to create the vector database."}
              </p>
            </div>
          </div>
          {!building && (
            <motion.button
              onClick={handleBuild}
              disabled={documents.length === 0}
              className="px-5 py-2.5 bg-accent text-white font-medium rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {project?.kb_status === "ready" ? "Rebuild" : "Build Knowledge Base"}
            </motion.button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <motion.button
          onClick={() => router.push(`/projects/${projectId}/setup`)}
          className="px-5 py-2.5 bg-card border border-border text-white font-medium rounded-[10px] hover:border-muted transition-all text-sm flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </motion.button>

        <motion.button
          onClick={() => router.push(`/projects/${projectId}/evaluate`)}
          disabled={project?.kb_status !== "ready"}
          className="px-8 py-2.5 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Continue
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </motion.button>
      </div>
    </motion.div>
  );
}
