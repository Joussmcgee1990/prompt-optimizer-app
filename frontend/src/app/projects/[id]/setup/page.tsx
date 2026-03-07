"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { getProject, updateProject, generatePromptTemplate, type Project } from "@/lib/api";
import PromptEditor from "@/components/prompt-editor";
import ModelBadge from "@/components/model-badge";
import ProcessingBanner from "@/components/processing-banner";

const DEFAULT_PROMPT = `You are a knowledgeable advisor. Your role is to provide accurate, helpful answers based strictly on the provided reference material.

Context from knowledge base:
{context}

User's question:
{question}

Instructions:
- Answer ONLY using information from the context above
- Be specific — cite details, names, numbers, and dates from the source material
- If the context doesn't contain enough information to fully answer, clearly state what's missing
- Structure your response with clear paragraphs for readability
- Keep your tone professional but approachable`;

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
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

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

  async function handleGeneratePrompt() {
    if (!description.trim()) return;
    setGeneratingPrompt(true);
    try {
      const result = await generatePromptTemplate(projectId, name.trim(), description.trim());
      setPromptTemplate(result.prompt_template);
    } catch (err) {
      console.error("Failed to generate prompt:", err);
    } finally {
      setGeneratingPrompt(false);
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
          Tell us about your project so we can tailor the prompt optimization to your needs.
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
            placeholder="e.g. Acme Corp Customer Support Bot"
            className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-xs text-muted/60 mt-1.5">
            A short, descriptive name for this optimization project.
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1.5 block">
            What does this project do?
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={"Describe what your AI assistant should know and do.\n\nExample: \"A customer support chatbot for Acme Corp that answers questions about our SaaS product pricing, features, onboarding process, and troubleshooting guides.\""}
            rows={4}
            className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors resize-none"
          />
          <p className="text-xs text-muted/60 mt-1.5">
            This description helps generate better evaluation questions and optimize your prompt more effectively.
          </p>
        </div>

        {/* Prompt Template */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center">
                <svg className="w-3 h-3 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-xs text-muted">
                Auto-generate a tailored prompt from your description, or customize the default.
              </span>
            </div>
            <motion.button
              onClick={handleGeneratePrompt}
              disabled={generatingPrompt || !description.trim()}
              className="px-4 py-1.5 text-xs text-accent border border-accent/30 rounded-lg hover:bg-accent/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
              whileTap={{ scale: 0.95 }}
            >
              {generatingPrompt ? (
                <>
                  <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Auto-Generate Prompt
                </>
              )}
            </motion.button>
            <ModelBadge model="sonnet" />
          </div>
          <AnimatePresence>
            {generatingPrompt && (
              <ProcessingBanner
                message="Generating Prompt Template..."
                detail="AI is crafting a tailored prompt based on your project description"
                variant="generating"
              />
            )}
          </AnimatePresence>
          <PromptEditor
            value={promptTemplate}
            onChange={setPromptTemplate}
            label="Prompt Template"
            description="This is the instruction template sent to Claude when answering questions. Use {context} for retrieved documents and {question} for the user's query."
          />
        </div>
      </div>

      {/* Saving indicator */}
      <AnimatePresence>
        {saving && (
          <ProcessingBanner
            message="Saving Project..."
            detail="Updating your project settings"
            variant="saving"
            showProgress={false}
          />
        )}
      </AnimatePresence>

      {/* Spacer for sticky mobile bar */}
      <div className="h-28 md:hidden" />

      {/* Actions — sticky on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0d1117] border-t-[3px] border-accent px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,130,243,0.15)] md:static md:bg-transparent md:border-t-0 md:border-0 md:px-0 md:py-0 md:shadow-none">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <motion.button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-card border border-border text-white font-medium rounded-[10px] hover:border-muted transition-all text-sm disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {saved ? "✓ Saved!" : saving ? "Saving..." : "Save"}
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
      </div>
    </motion.div>
  );
}
