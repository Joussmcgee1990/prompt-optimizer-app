"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listProjects, createProject, type Project } from "@/lib/api";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await createProject({
        name: newName.trim(),
        description: newDesc.trim(),
      });
      router.push(`/projects/${project.id}/setup`);
    } catch (err) {
      console.error("Failed to create project:", err);
      setCreating(false);
    }
  }

  function getStatusColor(status: string) {
    if (status === "ready") return "bg-success";
    if (status === "loading") return "bg-warning";
    return "bg-muted";
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-semibold text-white tracking-wide">
              Prompt Optimizer
            </span>
          </Link>
        </div>
      </nav>

      <div className="pt-24 pb-12 px-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-sm text-muted mt-1">
              Each project has its own knowledge base, evaluations, and optimized prompts.
            </p>
          </div>
          <motion.button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 bg-white text-black font-semibold rounded-[10px] hover:bg-white/90 transition-all text-sm"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            + New Project
          </motion.button>
        </div>

        {/* Create Modal */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !creating && setShowCreate(false)}
            >
              <motion.div
                className="bg-card rounded-[20px] p-8 w-full max-w-md border border-border"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-semibold text-white mb-4">
                  Create New Project
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. My Company Bot"
                      className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">
                      Description (optional)
                    </label>
                    <textarea
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="Brief description of what this project is about..."
                      rows={3}
                      className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setShowCreate(false)}
                      disabled={creating}
                      className="px-4 py-2 text-sm text-muted hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={!newName.trim() || creating}
                      className="px-6 py-2 bg-accent text-white font-medium rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creating ? "Creating..." : "Create"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Projects Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            className="text-center py-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="w-16 h-16 rounded-full bg-card mx-auto flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-muted mb-4">No projects yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-2.5 bg-accent text-white font-medium rounded-[10px] hover:bg-accent-hover transition-all text-sm"
            >
              Create Your First Project
            </button>
          </motion.div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {projects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/projects/${project.id}/setup`}
                  className="block bg-card rounded-[20px] p-6 border border-border hover:border-accent/30 transition-all duration-300 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-white group-hover:text-accent transition-colors">
                      {project.name}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(project.kb_status)}`} />
                      <span className="text-xs text-muted capitalize">
                        {project.kb_status}
                      </span>
                    </div>
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted mb-3 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>{project.kb_doc_count} docs</span>
                    <span>
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
