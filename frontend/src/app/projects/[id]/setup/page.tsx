"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getProject, updateProject, type Project } from "@/lib/api";
import PromptEditor from "@/components/prompt-editor";

const DEFAULT_PROMPT = `You are a helpful assistant for {company_name}. Use the following context to answer the user's question accurately and thoroughly.

Context:
{context}

Question: {question}

Instructions:
- Only use information from the provided context
- If the context doesn't contain enough information, say so
- Be specific and reference details from the context
- Keep your answer concise but complete`;

export default function SetupPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  async function loadProject() {
    try {
      const p = await getProject(projectId);
      setProject(p);
      setName(p.name);
      setDescription(p.description);
      setPromptTemplate(p.prompt_template || DEFAULT_PROMPT);
    } catch (err) {
      console.error("Failed to load project:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateProject(projectId, {
        name: name.trim(),
        description: description.trim(),
        prompt_template: promptTemplate,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save project:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndContinue() {
    setSaving(true);
    try {
      await updateProject(projectId, {
        name: name.trim(),
        description: description.trim(),
        prompt_template: promptTemplate,
      });
      router.push(`/projects/${projectId}/documents`);
    } catch (err) {
      console.error("Failed to save project:", err);
      setSaving(false);
    }
  }

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
        <h1 className="text-2xl font-bold text-white">Project Setup</h1>
        <p className="text-sm text-muted mt-1">
          Configure your project details and initial prompt template.
        </p>
      </div>

      <div className="bg-card rounded-[20px] p-8 border border-border space-y-6">
        {/* Name */}
        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1.5 block">
            Project Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Company RAG Bot"
            className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1.5 block">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of what this project is about..."
            rows={3}
            className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors resize-none"
          />
        </div>

        {/* Prompt Template */}
        <PromptEditor
          value={promptTemplate}
          onChange={setPromptTemplate}
          label="Prompt Template"
          description="This template is used when querying your knowledge base. Use {context} and {question} as placeholders."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <motion.button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-card border border-border text-white font-medium rounded-[10px] hover:border-muted transition-all text-sm disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {saved ? "Saved!" : saving ? "Saving..." : "Save"}
        </motion.button>

        <motion.button
          onClick={handleSaveAndContinue}
          disabled={saving || !name.trim()}
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
