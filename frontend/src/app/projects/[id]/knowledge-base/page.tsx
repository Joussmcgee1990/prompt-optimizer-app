"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  getProject,
  startKBBuild,
  streamKBBuild,
  streamSystemDocs,
  listKBFiles,
  getKBFileContent,
  updateKBFileContent,
  getKBStatus,
  loadData,
  getGoalQuestions,
  saveGoal,
  getGoal,
  updateGoal,
  generateSystemDocs,
  uploadDocuments,
  listDocuments,
  deleteDocument,
  researchUrl,
  getDocumentContent,
  updateDocumentContent,
  getGapAnalysis,
  type Project,
  type KBFile,
  type GoalQuestion,
  type GoalAnswer,
  type DocumentInfo,
  type GapAnalysis,
  type GapItem,
} from "@/lib/api";
import TerminalOutput, { type TerminalLine } from "@/components/terminal-output";
import FileUpload from "@/components/file-upload";
import ModelBadge from "@/components/model-badge";
import ProcessingBanner from "@/components/processing-banner";

type KBPageState = "input" | "building" | "review";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function KnowledgePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Section collapse state ──
  const [goalOpen, setGoalOpen] = useState(true);
  const [kbOpen, setKbOpen] = useState(true);
  const [systemDocsOpen, setSystemDocsOpen] = useState(false);
  const [uploadsOpen, setUploadsOpen] = useState(false);

  // ── Goal state ──
  const [goalQuestions, setGoalQuestions] = useState<GoalQuestion[]>([]);
  const [goalAnswers, setGoalAnswers] = useState<Record<string, string>>({});
  const [goalLoading, setGoalLoading] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [hasGoal, setHasGoal] = useState(false);
  const [goalDefinition, setGoalDefinition] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  // ── KB Builder state ──
  const [kbPageState, setKbPageState] = useState<KBPageState>("input");
  const [urls, setUrls] = useState<string[]>([""]);
  const [userNotes, setUserNotes] = useState("");
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [building, setBuilding] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lineIdRef = useRef(0);

  // KB Review state
  const [kbFiles, setKbFiles] = useState<KBFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editingFile, setEditingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);

  // ── System Docs state ──
  const [generatingSystemDocs, setGeneratingSystemDocs] = useState(false);
  const [sysDocLines, setSysDocLines] = useState<TerminalLine[]>([]);
  const sysDocLineIdRef = useRef(0);
  const [systemDocFiles, setSystemDocFiles] = useState<KBFile[]>([]);
  const [selectedSysDoc, setSelectedSysDoc] = useState<string | null>(null);
  const [sysDocContent, setSysDocContent] = useState("");
  const [editingSysDoc, setEditingSysDoc] = useState(false);
  const [savingSysDoc, setSavingSysDoc] = useState(false);
  const sysDocCleanupRef = useRef<(() => void) | null>(null);

  // ── Gap Analysis state ──
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null);
  const uploadsRef = useRef<HTMLDivElement>(null);

  // ── Uploads state ──
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [researchUrlInput, setResearchUrlInput] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchMessage, setResearchMessage] = useState("");

  // Document editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFilename, setEditorFilename] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);

  // Loading KB into ChromaDB
  const [loadingKB, setLoadingKB] = useState(false);

  // ── Load everything ──
  useEffect(() => {
    loadAll();
    return () => {
      if (cleanupRef.current) cleanupRef.current();
      if (sysDocCleanupRef.current) sysDocCleanupRef.current();
    };
  }, [projectId]);

  async function loadAll() {
    try {
      const [p, goalData, statusData, docData] = await Promise.all([
        getProject(projectId),
        getGoal(projectId),
        getKBStatus(projectId),
        listDocuments(projectId),
      ]);
      setProject(p);
      setDocuments(docData.documents);

      // Goal
      if (goalData.has_goal) {
        setHasGoal(true);
        setGoalDefinition(goalData.goal_definition);
        setGoalOpen(false);
        // Restore questions + answers from saved data
        if (goalData.answers && goalData.answers.length > 0) {
          const restoredQuestions: GoalQuestion[] = goalData.answers.map((a: GoalAnswer) => ({
            id: a.id,
            question: a.question,
          }));
          setGoalQuestions(restoredQuestions);
          const answerMap: Record<string, string> = {};
          goalData.answers.forEach((a: GoalAnswer) => {
            answerMap[a.id] = a.answer;
          });
          setGoalAnswers(answerMap);
        }
      }

      // KB status
      if (statusData.status === "built" || statusData.status === "aligned") {
        await loadKBReviewData();
        setKbPageState("review");
        setKbOpen(false);
        setSystemDocsOpen(true);
        setUploadsOpen(true);
        // Load system doc files for inline editor
        await loadSystemDocFiles();
        // Load gap analysis if system docs exist
        try {
          const gaps = await getGapAnalysis(projectId);
          if (gaps.has_gaps && gaps.gaps.length > 0) {
            setGapAnalysis(gaps);
          }
        } catch {
          // Gap analysis not available yet — that's fine
        }
      }
    } catch (err) {
      console.error("Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadKBReviewData() {
    const { files } = await listKBFiles(projectId);
    setKbFiles(files);
    if (files.length > 0 && !selectedFile) {
      const first = files.find((f) => f.filename !== "00_meta.json") || files[0];
      setSelectedFile(first.filename);
      const { content } = await getKBFileContent(projectId, first.filename);
      setFileContent(content);
    }
  }

  // ── Goal handlers ──

  async function handleGenerateGoalQuestions() {
    setGoalLoading(true);
    try {
      const data = await getGoalQuestions(projectId);
      setGoalQuestions(data.questions);
    } catch (err) {
      console.error("Failed to generate goal questions:", err);
    } finally {
      setGoalLoading(false);
    }
  }

  async function handleSaveGoal() {
    setGoalSaving(true);
    try {
      const answers: GoalAnswer[] = goalQuestions.map((q) => ({
        id: q.id,
        question: q.question,
        answer: goalAnswers[q.id] || "",
      }));
      const result = await saveGoal(projectId, answers);
      setGoalDefinition(result.goal_definition);
      setHasGoal(true);
      setGoalOpen(false);
      // Refresh project
      const p = await getProject(projectId);
      setProject(p);
    } catch (err) {
      console.error("Failed to save goal:", err);
    } finally {
      setGoalSaving(false);
    }
  }

  async function handleUpdateGoalDefinition() {
    setGoalSaving(true);
    try {
      const result = await updateGoal(projectId, goalDraft);
      setGoalDefinition(result.goal_definition);
      setEditingGoal(false);
      // Refresh project
      const p = await getProject(projectId);
      setProject(p);
    } catch (err) {
      console.error("Failed to update goal:", err);
    } finally {
      setGoalSaving(false);
    }
  }

  // ── KB Builder handlers ──

  function addLine(text: string, type: TerminalLine["type"] = "info") {
    const id = `line-${++lineIdRef.current}`;
    setTerminalLines((prev) => [...prev, { id, text, type }]);
  }

  function addUrlField() {
    setUrls((prev) => [...prev, ""]);
  }
  function removeUrlField(index: number) {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }
  function updateUrl(index: number, value: string) {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  async function handleBuild() {
    const cleanUrls = urls
      .map((u) => u.trim())
      .filter(Boolean)
      .map((u) =>
        u.startsWith("http://") || u.startsWith("https://") ? u : `https://${u}`
      );
    if (!cleanUrls.length && !userNotes.trim()) return;

    setKbPageState("building");
    setBuilding(true);
    setTerminalLines([]);
    lineIdRef.current = 0;

    addLine("Knowledge Base Builder", "header");
    addLine(`Mode: ${cleanUrls.length ? (userNotes.trim() ? "hybrid" : "url") : "notes"}`, "dim");
    addLine("", "dim");

    try {
      const { build_id, slug } = await startKBBuild(projectId, {
        urls: cleanUrls,
        user_notes: userNotes,
      });

      addLine(`Build ID: ${build_id}`, "dim");
      addLine(`Slug: ${slug}`, "dim");
      addLine("", "dim");

      const cleanup = streamKBBuild(
        projectId,
        build_id,
        (event) => handleBuildEvent(event),
        async () => {
          setBuilding(false);
          await loadKBReviewData();
          setKbPageState("review");
          setKbOpen(false);
          setSystemDocsOpen(true);
          setUploadsOpen(true);
          // Auto-build vector DB
          handleLoadKB();
        },
        (err) => {
          addLine(`Connection error: ${err.message}`, "error");
          setBuilding(false);
        }
      );
      cleanupRef.current = cleanup;
    } catch (err) {
      addLine(`Failed to start build: ${err}`, "error");
      setBuilding(false);
    }
  }

  function handleBuildEvent(event: Record<string, unknown>) {
    switch (event.type) {
      case "build_start":
        addLine(`Starting build (${event.total_steps} steps)...`, "header");
        break;
      case "fetch_start":
        addLine("", "dim");
        addLine(`Deep-crawling URL ${event.index}/${event.total_urls}: ${event.url}`, "progress");
        break;
      case "crawl_page": {
        const status = event.status as string;
        const pageUrl = event.url as string;
        const shortUrl = pageUrl?.replace(/^https?:\/\//, "").slice(0, 60);
        if (status === "fetched") {
          const kb = ((event.content_length as number) / 1024).toFixed(1);
          addLine(`  ${event.is_main ? "Main page" : "Subpage"}: ${shortUrl} (${kb}KB)`, "dim");
        } else {
          addLine(`  Skipped: ${shortUrl}`, "dim");
        }
        break;
      }
      case "crawl_discovery":
        addLine(`  Found ${event.total_links} links, fetching top ${event.priority_links} subpages...`, "dim");
        break;
      case "fetch_complete": {
        const pages = event.pages_crawled as number;
        const kb = ((event.content_length as number) / 1024).toFixed(1);
        addLine(`Crawled ${pages} pages (${kb}KB total content)`, "success");
        break;
      }
      case "fetch_error":
        addLine(`Failed to fetch ${event.url}: ${event.error}`, "error");
        break;
      case "research_start":
        addLine("", "dim");
        addLine(`Synthesizing deep research from ${event.total_pages} pages...`, "header");
        break;
      case "research_complete":
        addLine(`Research synthesis complete (${((event.content_length as number) / 1024).toFixed(1)}KB)`, "success");
        break;
      case "research_error":
        addLine(`Research synthesis failed: ${event.error} — using raw content`, "error");
        break;
      case "file_start":
        addLine("", "dim");
        addLine(`[${event.step}/${event.total_steps}] Generating ${event.label}...`, "header");
        break;
      case "file_complete":
        addLine(`Wrote ${event.filename} (${((event.content_length as number) / 1024).toFixed(1)}KB)`, "success");
        break;
      case "file_error":
        addLine(`Failed to generate ${event.filename}: ${event.error}`, "error");
        break;
      case "eval_start":
        addLine("", "dim");
        addLine("Generating alignment questions...", "progress");
        break;
      case "eval_complete": {
        const questions = event.questions as { question: string }[];
        if (questions?.length) {
          addLine(`Generated ${questions.length} alignment questions`, "success");
        }
        break;
      }
      case "complete": {
        addLine("", "dim");
        addLine("═══════════════════════════════════", "header");
        addLine(
          `Build complete! ${(event as Record<string, unknown>).file_count} files, ${(((event as Record<string, unknown>).total_size as number) / 1024).toFixed(1)}KB total`,
          "success"
        );
        break;
      }
      case "error":
        addLine(`Error: ${event.message}`, "error");
        break;
    }
  }

  // ── KB File viewer ──

  async function selectFile(filename: string) {
    setSelectedFile(filename);
    setEditingFile(false);
    try {
      const { content } = await getKBFileContent(projectId, filename);
      setFileContent(content);
    } catch (err) {
      console.error("Failed to load file:", err);
    }
  }

  async function saveKBFile() {
    if (!selectedFile) return;
    setSavingFile(true);
    try {
      await updateKBFileContent(projectId, selectedFile, fileContent);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSavingFile(false);
      setEditingFile(false);
    }
  }

  // ── System Docs ──

  function addSysDocLine(text: string, type: TerminalLine["type"] = "info") {
    const id = `sysline-${++sysDocLineIdRef.current}`;
    setSysDocLines((prev) => [...prev, { id, text, type }]);
  }

  async function loadSystemDocFiles() {
    try {
      const { files } = await listKBFiles(projectId);
      const sysDocs = files.filter((f) => f.filename.startsWith("_system_"));
      setSystemDocFiles(sysDocs);
    } catch (err) {
      console.error("Failed to load system doc files:", err);
    }
  }

  async function selectSysDoc(filename: string) {
    setSelectedSysDoc(filename);
    setEditingSysDoc(false);
    try {
      const { content } = await getKBFileContent(projectId, filename);
      setSysDocContent(content);
    } catch (err) {
      console.error("Failed to load system doc:", err);
    }
  }

  async function saveSysDoc() {
    if (!selectedSysDoc) return;
    setSavingSysDoc(true);
    try {
      await updateKBFileContent(projectId, selectedSysDoc, sysDocContent);
      // Refresh file list to update sizes
      await loadSystemDocFiles();
      await loadKBReviewData();
      // Reindex vector DB
      handleLoadKB();
    } catch (err) {
      console.error("Failed to save system doc:", err);
    } finally {
      setSavingSysDoc(false);
      setEditingSysDoc(false);
    }
  }

  function handleGenerateSystemDocs() {
    setGeneratingSystemDocs(true);
    setSysDocLines([]);
    sysDocLineIdRef.current = 0;
    setSystemDocFiles([]);
    setSelectedSysDoc(null);
    setSysDocContent("");

    addSysDocLine("System Document Generator", "header");
    addSysDocLine("Generating rubric, guidelines, and gap analysis...", "dim");
    addSysDocLine("", "dim");

    const cleanup = streamSystemDocs(
      projectId,
      (event) => handleSysDocEvent(event),
      async () => {
        setGeneratingSystemDocs(false);
        await loadSystemDocFiles();
        await loadKBReviewData();
        // Auto-build vector DB
        handleLoadKB();
      },
      (err) => {
        addSysDocLine(`Connection error: ${err.message}`, "error");
        setGeneratingSystemDocs(false);
      }
    );
    sysDocCleanupRef.current = cleanup;
  }

  function handleSysDocEvent(event: Record<string, unknown>) {
    switch (event.type) {
      case "sysdoc_start":
        addSysDocLine(`Generating ${event.total_files} system documents...`, "progress");
        break;
      case "sysdoc_file_start":
        addSysDocLine("", "dim");
        addSysDocLine(`[${event.step}/${event.total_steps}] Generating ${event.label}...`, "header");
        break;
      case "sysdoc_file_complete":
        addSysDocLine(
          `Wrote ${event.filename} (${((event.content_length as number) / 1024).toFixed(1)}KB)`,
          "success"
        );
        // Capture structured gap data from the stream
        if (event.gap_data) {
          const gapData = event.gap_data as GapAnalysis;
          if (gapData.has_gaps && gapData.gaps?.length > 0) {
            setGapAnalysis(gapData);
          }
        }
        break;
      case "sysdoc_file_skip":
        addSysDocLine(`Skipped ${event.filename}: ${event.reason}`, "dim");
        break;
      case "sysdoc_file_error":
        addSysDocLine(`Failed to generate ${event.filename}: ${event.error}`, "error");
        break;
      case "sysdoc_complete":
        addSysDocLine("", "dim");
        addSysDocLine("═══════════════════════════════════", "header");
        addSysDocLine(
          `Complete! ${event.file_count} system documents generated (${((event.total_size as number) / 1024).toFixed(1)}KB)`,
          "success"
        );
        break;
      case "error":
        addSysDocLine(`Error: ${event.message}`, "error");
        break;
    }
  }

  // ── Uploads ──

  async function handleUpload(files: File[]) {
    setUploading(true);
    try {
      await uploadDocuments(projectId, files);
      const d = await listDocuments(projectId);
      setDocuments(d.documents);
      // Auto-build vector DB after upload
      handleLoadKB();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDocument(filename: string) {
    try {
      await deleteDocument(projectId, filename);
      setDocuments((prev) => prev.filter((d) => d.filename !== filename));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  async function handleResearchUrl() {
    if (!researchUrlInput.trim()) return;
    setResearching(true);
    setResearchMessage("");
    try {
      const result = await researchUrl(projectId, researchUrlInput.trim());
      setResearchMessage(`Saved as ${result.filename}`);
      setResearchUrlInput("");
      const d = await listDocuments(projectId);
      setDocuments(d.documents);
      downloadMarkdown(result.filename, result.content);
      setEditorFilename(result.filename);
      setEditorContent(result.content);
      setEditorDirty(false);
      setEditorOpen(true);
      // Auto-build vector DB after research
      handleLoadKB();
    } catch (err) {
      console.error("Research failed:", err);
      setResearchMessage("Failed to research URL. Please check the URL and try again.");
    } finally {
      setResearching(false);
    }
  }

  async function handleOpenEditor(filename: string) {
    try {
      const result = await getDocumentContent(projectId, filename);
      setEditorFilename(result.filename);
      setEditorContent(result.content);
      setEditorDirty(false);
      setEditorOpen(true);
    } catch (err) {
      console.error("Failed to load document:", err);
    }
  }

  async function handleEditorSave() {
    setEditorSaving(true);
    try {
      await updateDocumentContent(projectId, editorFilename, editorContent);
      setEditorDirty(false);
      const d = await listDocuments(projectId);
      setDocuments(d.documents);
    } catch (err) {
      console.error("Failed to save document:", err);
    } finally {
      setEditorSaving(false);
    }
  }

  function handleEditorClose() {
    if (editorDirty) {
      if (!confirm("You have unsaved changes. Close without saving?")) return;
    }
    setEditorOpen(false);
    setEditorFilename("");
    setEditorContent("");
    setEditorDirty(false);
  }

  // ── Load into ChromaDB ──

  async function handleLoadKB() {
    setLoadingKB(true);
    try {
      await loadData(projectId);
      const poll = setInterval(async () => {
        const p = await getProject(projectId);
        if (p.kb_status === "ready") {
          clearInterval(poll);
          setProject(p);
          setLoadingKB(false);
        }
      }, 2000);
    } catch (err) {
      console.error("Failed to load KB:", err);
      setLoadingKB(false);
    }
  }

  const hasSystemDocs = kbFiles.some((f) => f.filename.startsWith("_system_"));

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
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-white">Knowledge</h1>
        <p className="text-sm text-muted mt-1">
          Define your goal, build a knowledge base, generate system documents, and upload additional files.
        </p>
      </div>

      {/* ═══════════════ SECTION 1: GOAL REFINEMENT ═══════════════ */}
      <CollapsibleSection
        title="Goal Refinement"
        subtitle={hasGoal ? "Goal defined" : "Define what success looks like"}
        open={goalOpen}
        onToggle={() => setGoalOpen(!goalOpen)}
        badge={hasGoal ? "complete" : undefined}
      >
        {hasGoal && goalDefinition && !editingGoal && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[12px] p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-emerald-300">Goal Defined</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setHasGoal(false); }}
                  className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Q&amp;A
                </button>
                <button
                  onClick={() => { setGoalDraft(goalDefinition); setEditingGoal(true); }}
                  className="text-xs text-muted hover:text-white transition-colors"
                >
                  Edit definition
                </button>
                <button
                  onClick={() => { setHasGoal(false); setGoalQuestions([]); setGoalAnswers({}); }}
                  className="text-xs text-muted hover:text-white transition-colors"
                >
                  Regenerate
                </button>
              </div>
            </div>
            <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto">
              {goalDefinition}
            </pre>
          </div>
        )}

        {hasGoal && editingGoal && (
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Edit Goal Definition</span>
              <span className="text-xs text-muted">Markdown supported</span>
            </div>
            <textarea
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              rows={14}
              className="w-full bg-card-lighter border border-border rounded-[8px] px-3 py-2 text-sm text-white font-mono placeholder:text-muted focus:outline-none focus:border-accent transition-colors resize-y"
            />
            <AnimatePresence>
              {goalSaving && (
                <ProcessingBanner
                  message="Updating Goal Definition..."
                  detail="Saving your changes"
                  variant="saving"
                />
              )}
            </AnimatePresence>
            {!goalSaving && (
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditingGoal(false)}
                  className="px-4 py-2 text-xs text-muted hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  onClick={handleUpdateGoalDefinition}
                  disabled={!goalDraft.trim()}
                  className="px-5 py-2 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Save Changes
                </motion.button>
              </div>
            )}
          </div>
        )}

        {!hasGoal && (
          <>
            {goalQuestions.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted mb-4">
                  Generate clarifying questions to tighten your project&apos;s goal definition, or add your own manually.
                </p>
                <div className="flex items-center gap-3 justify-center">
                  <motion.button
                    onClick={handleGenerateGoalQuestions}
                    disabled={goalLoading || !project?.description?.trim()}
                    className="px-6 py-2.5 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {goalLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating questions...
                      </>
                    ) : (
                      "Generate Goal Questions"
                    )}
                  </motion.button>
                  <span className="text-xs text-muted/60">or</span>
                  <motion.button
                    onClick={() => {
                      const newId = `custom_${Date.now()}`;
                      setGoalQuestions([{ id: newId, question: "", hint: "", category: "success" as const }]);
                    }}
                    disabled={goalLoading}
                    className="px-6 py-2.5 border border-border/50 text-muted hover:text-white hover:border-accent/40 font-semibold rounded-[10px] transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Manually Add
                  </motion.button>
                </div>
                <div className="mt-3 flex justify-center">
                  <ModelBadge model="sonnet" />
                </div>
                {!project?.description?.trim() && (
                  <p className="text-xs text-muted/60 mt-2">
                    Add a project description in Setup first to use auto-generate.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {goalQuestions.map((q, qi) => (
                  <div key={q.id} className="space-y-2 bg-card-lighter/50 rounded-[10px] p-3 border border-border/30">
                    <div className="flex items-start gap-2">
                      <textarea
                        value={q.question}
                        onChange={(e) => {
                          const updated = [...goalQuestions];
                          updated[qi] = { ...updated[qi], question: e.target.value };
                          setGoalQuestions(updated);
                          // Auto-resize
                          e.target.style.height = "auto";
                          e.target.style.height = e.target.scrollHeight + "px";
                        }}
                        ref={(el) => {
                          // Auto-resize on mount
                          if (el) {
                            el.style.height = "auto";
                            el.style.height = el.scrollHeight + "px";
                          }
                        }}
                        rows={1}
                        className="flex-1 bg-transparent text-sm text-white font-medium focus:outline-none border-b border-transparent focus:border-accent/40 pb-0.5 transition-colors resize-none overflow-hidden leading-relaxed"
                        placeholder="Question..."
                      />
                      <button
                        onClick={() => {
                          const updated = goalQuestions.filter((_, i) => i !== qi);
                          setGoalQuestions(updated);
                          setGoalAnswers((prev) => {
                            const next = { ...prev };
                            delete next[q.id];
                            return next;
                          });
                        }}
                        className="text-muted/40 hover:text-error transition-colors shrink-0 mt-0.5"
                        title="Remove question"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <textarea
                      value={goalAnswers[q.id] || ""}
                      onChange={(e) =>
                        setGoalAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      rows={2}
                      placeholder="Your answer..."
                      className="w-full bg-card-lighter border border-border rounded-[8px] px-3 py-2 text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent transition-colors resize-none"
                    />
                  </div>
                ))}
                <button
                  onClick={() => {
                    const newId = `custom_${Date.now()}`;
                    setGoalQuestions((prev) => [
                      ...prev,
                      { id: newId, question: "", hint: "", category: "success" },
                    ]);
                  }}
                  className="w-full py-2.5 border border-dashed border-border/50 rounded-[10px] text-xs text-muted hover:text-white hover:border-accent/40 transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add question
                </button>
                <AnimatePresence>
                  {goalSaving && (
                    <ProcessingBanner
                      message="Saving Goal Definition..."
                      detail="Analyzing your answers and generating a structured goal definition"
                      variant="saving"
                    />
                  )}
                </AnimatePresence>
                {!goalSaving && (
                  <div className="flex justify-end">
                    <motion.button
                      onClick={handleSaveGoal}
                      disabled={goalSaving || goalQuestions.length === 0 || goalQuestions.some((q) => !q.question.trim() || !goalAnswers[q.id]?.trim())}
                      className="px-6 py-2.5 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Save Goal Definition
                    </motion.button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CollapsibleSection>

      {/* ═══════════════ SECTION 2: KB BUILDER ═══════════════ */}
      <CollapsibleSection
        title="KB Builder"
        subtitle={
          kbPageState === "review"
            ? `${kbFiles.length} files generated`
            : "Build knowledge base from URLs and notes"
        }
        open={kbOpen}
        onToggle={() => setKbOpen(!kbOpen)}
        badge={kbPageState === "review" ? "complete" : kbPageState === "building" ? "building" : undefined}
      >
        {/* Input */}
        {kbPageState === "input" && (
          <div className="space-y-4">
            {/* URLs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-white">Source URLs</label>
                <button onClick={addUrlField} className="text-xs text-accent hover:text-accent-hover transition-colors">
                  + Add URL
                </button>
              </div>
              <div className="space-y-2">
                {urls.map((url, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => updateUrl(i, e.target.value)}
                      placeholder="https://company.com/about"
                      className="flex-1 bg-card-lighter border border-border rounded-[10px] px-4 py-2.5 text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
                    />
                    {urls.length > 1 && (
                      <button onClick={() => removeUrlField(i)} className="px-3 text-muted hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">Additional Notes</label>
              <textarea
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="Add context, product details, target market info..."
                rows={4}
                className="w-full bg-card-lighter border border-border rounded-[10px] px-4 py-3 text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent transition-colors resize-none"
              />
            </div>

            <div className="flex justify-center">
              <motion.button
                onClick={handleBuild}
                disabled={!urls.some((u) => u.trim()) && !userNotes.trim()}
                className="px-10 py-3 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Build Knowledge Base
              </motion.button>
              <ModelBadge model="gemini" />
            </div>
          </div>
        )}

        {/* Building */}
        {kbPageState === "building" && (
          <TerminalOutput
            lines={terminalLines}
            title={`kb-builder — ${project?.name || "project"}`}
            maxHeight="500px"
          />
        )}

        {/* Review */}
        {kbPageState === "review" && (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[12px] p-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-emerald-300">
                {kbFiles.length} files generated. Click a file to review or edit.
              </span>
              <button
                onClick={() => { setKbPageState("input"); setKbOpen(true); }}
                className="text-xs text-accent hover:text-accent-hover ml-auto transition-colors"
              >
                Rebuild
              </button>
            </div>

            {/* File browser */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4 bg-card-lighter rounded-[12px] border border-border overflow-hidden">
                <div className="p-3 border-b border-border">
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider">KB Files</h4>
                </div>
                <div className="p-1.5 max-h-[350px] overflow-y-auto">
                  {kbFiles.map((file) => (
                    <button
                      key={file.filename}
                      onClick={() => selectFile(file.filename)}
                      className={`w-full text-left px-2.5 py-2 rounded-[6px] text-xs transition-all ${
                        selectedFile === file.filename
                          ? "bg-accent/20 text-accent"
                          : "text-muted hover:text-white hover:bg-card"
                      }`}
                    >
                      <div className="font-medium truncate">
                        {file.filename.startsWith("_system_") && (
                          <span className="inline-block px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-[10px] mr-1.5">SYS</span>
                        )}
                        {file.label}
                      </div>
                      <div className="text-[10px] opacity-60 mt-0.5">
                        {(file.size / 1024).toFixed(1)}KB
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-8 bg-card-lighter rounded-[12px] border border-border overflow-hidden">
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-white">{selectedFile || "Select a file"}</h4>
                  <div className="flex gap-1.5">
                    {editingFile ? (
                      <>
                        <button onClick={() => setEditingFile(false)} className="px-2.5 py-1 text-[10px] text-muted hover:text-white border border-border rounded-[4px] transition-colors">
                          Cancel
                        </button>
                        <button
                          onClick={saveKBFile}
                          disabled={savingFile}
                          className="px-2.5 py-1 text-[10px] bg-accent text-white rounded-[4px] hover:bg-accent-hover transition-colors disabled:opacity-50"
                        >
                          {savingFile ? "Saving..." : "Save"}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setEditingFile(true)}
                        className="px-2.5 py-1 text-[10px] text-muted hover:text-white border border-border rounded-[4px] transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-3 max-h-[350px] overflow-y-auto">
                  {editingFile ? (
                    <textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      className="w-full h-[300px] bg-card border border-border rounded-[6px] px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-accent transition-colors resize-none"
                    />
                  ) : (
                    <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {fileContent}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* ═══════════════ SECTION 3: SYSTEM DOCUMENTS ═══════════════ */}
      <CollapsibleSection
        title="System Documents"
        subtitle={hasSystemDocs ? "Rubric & guidelines generated" : "Auto-generate rubric, guidelines, and gap analysis"}
        open={systemDocsOpen}
        onToggle={() => setSystemDocsOpen(!systemDocsOpen)}
        badge={hasSystemDocs ? "complete" : generatingSystemDocs ? "building" : undefined}
        disabled={kbPageState !== "review"}
      >
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Generate evaluation rubrics, response guidelines, and gap analysis based on your goal definition and KB content. These are loaded into the vector DB to improve response quality.
          </p>

          {/* Generate / Regenerate button */}
          <div className="flex items-center gap-3">
            <motion.button
              onClick={handleGenerateSystemDocs}
              disabled={generatingSystemDocs || !hasGoal}
              className="px-6 py-2.5 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {generatingSystemDocs ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : hasSystemDocs ? (
                "Regenerate System Documents"
              ) : (
                "Generate System Documents"
              )}
            </motion.button>
            <ModelBadge model="sonnet" />
          </div>

          {!hasGoal && (
            <p className="text-xs text-muted/60">
              Complete the Goal Refinement step first to generate system documents.
            </p>
          )}

          {/* Processing banner during generation */}
          <AnimatePresence>
            {generatingSystemDocs && (
              <ProcessingBanner
                message="Generating System Documents..."
                detail="Creating rubric, guidelines, and gap analysis from your knowledge base"
                variant="generating"
              />
            )}
          </AnimatePresence>

          {/* Terminal output during generation */}
          {sysDocLines.length > 0 && (
            <TerminalOutput
              lines={sysDocLines}
              title={`system-docs — ${project?.name || "project"}`}
              maxHeight="350px"
            />
          )}

          {/* Inline file browser/editor for system docs */}
          {systemDocFiles.length > 0 && !generatingSystemDocs && (
            <div className="space-y-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[12px] p-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs text-emerald-300">
                  {systemDocFiles.length} system document{systemDocFiles.length !== 1 ? "s" : ""} generated. Click to review or edit.
                </span>
              </div>

              <div className="grid grid-cols-12 gap-3">
                {/* File list */}
                <div className="col-span-4 bg-card-lighter rounded-[12px] border border-border overflow-hidden">
                  <div className="p-3 border-b border-border">
                    <h4 className="text-xs font-semibold text-white uppercase tracking-wider">System Files</h4>
                  </div>
                  <div className="p-1.5 max-h-[300px] overflow-y-auto">
                    {systemDocFiles.map((file) => (
                      <button
                        key={file.filename}
                        onClick={() => selectSysDoc(file.filename)}
                        className={`w-full text-left px-2.5 py-2 rounded-[6px] text-xs transition-all ${
                          selectedSysDoc === file.filename
                            ? "bg-purple-500/20 text-purple-300"
                            : "text-muted hover:text-white hover:bg-card"
                        }`}
                      >
                        <div className="font-medium truncate">
                          <span className="inline-block px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-[10px] mr-1.5">SYS</span>
                          {file.label}
                        </div>
                        <div className="text-[10px] opacity-60 mt-0.5">
                          {(file.size / 1024).toFixed(1)}KB
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content viewer/editor */}
                <div className="col-span-8 bg-card-lighter rounded-[12px] border border-border overflow-hidden">
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-white">{selectedSysDoc || "Select a file"}</h4>
                    <div className="flex gap-1.5">
                      {selectedSysDoc && (
                        editingSysDoc ? (
                          <>
                            <button onClick={() => setEditingSysDoc(false)} className="px-2.5 py-1 text-[10px] text-muted hover:text-white border border-border rounded-[4px] transition-colors">
                              Cancel
                            </button>
                            <button
                              onClick={saveSysDoc}
                              disabled={savingSysDoc}
                              className="px-2.5 py-1 text-[10px] bg-accent text-white rounded-[4px] hover:bg-accent-hover transition-colors disabled:opacity-50"
                            >
                              {savingSysDoc ? "Saving..." : "Save"}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setEditingSysDoc(true)}
                            className="px-2.5 py-1 text-[10px] text-muted hover:text-white border border-border rounded-[4px] transition-colors"
                          >
                            Edit
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  <div className="p-3 max-h-[300px] overflow-y-auto">
                    {selectedSysDoc ? (
                      editingSysDoc ? (
                        <textarea
                          value={sysDocContent}
                          onChange={(e) => setSysDocContent(e.target.value)}
                          className="w-full h-[250px] bg-card border border-border rounded-[6px] px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-accent transition-colors resize-none"
                        />
                      ) : (
                        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                          {sysDocContent}
                        </pre>
                      )
                    ) : (
                      <p className="text-xs text-muted text-center py-8">Select a system document to view</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Gap Analysis Cards ── */}
          {gapAnalysis && gapAnalysis.gaps.length > 0 && !generatingSystemDocs && (
            <div className="space-y-3 mt-2">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-[12px] p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-xs font-semibold text-amber-300">
                    {gapAnalysis.gaps.length} knowledge gap{gapAnalysis.gaps.length !== 1 ? "s" : ""} found
                  </span>
                </div>
                {gapAnalysis.summary && (
                  <p className="text-xs text-amber-200/70 ml-6">{gapAnalysis.summary}</p>
                )}
              </div>

              <div className="space-y-2">
                {gapAnalysis.gaps.map((gap, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-card-lighter rounded-[10px] border border-border p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                        gap.severity === "critical" ? "bg-red-400" :
                        gap.severity === "important" ? "bg-amber-400" : "bg-emerald-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-white">{gap.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            gap.severity === "critical" ? "bg-red-500/20 text-red-300" :
                            gap.severity === "important" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
                          }`}>
                            {gap.severity === "nice_to_have" ? "nice to have" : gap.severity}
                          </span>
                        </div>
                        <p className="text-xs text-muted mt-1">{gap.description}</p>
                        <div className="mt-2 flex items-center gap-2">
                          {gap.action_type === "research_url" && (
                            <button
                              onClick={() => {
                                setUploadsOpen(true);
                                setResearchUrlInput(gap.action_hint);
                                setTimeout(() => {
                                  uploadsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }, 150);
                              }}
                              className="text-[10px] px-2.5 py-1.5 bg-accent/10 text-accent border border-accent/20 rounded-[6px] hover:bg-accent/20 transition-colors flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                              </svg>
                              Research URL
                            </button>
                          )}
                          {gap.action_type === "upload_doc" && (
                            <button
                              onClick={() => {
                                setUploadsOpen(true);
                                setTimeout(() => {
                                  uploadsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }, 150);
                              }}
                              className="text-[10px] px-2.5 py-1.5 bg-accent/10 text-accent border border-accent/20 rounded-[6px] hover:bg-accent/20 transition-colors flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                              Upload Document
                            </button>
                          )}
                          {gap.action_type === "manual_input" && (
                            <button
                              onClick={() => {
                                setUploadsOpen(true);
                                setTimeout(() => {
                                  uploadsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }, 150);
                              }}
                              className="text-[10px] px-2.5 py-1.5 bg-accent/10 text-accent border border-accent/20 rounded-[6px] hover:bg-accent/20 transition-colors flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Add Info
                            </button>
                          )}
                          <span className="text-[10px] text-muted/60 truncate">{gap.action_hint}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ═══════════════ SECTION 4: ADDITIONAL UPLOADS ═══════════════ */}
      <div ref={uploadsRef} />
      <CollapsibleSection
        title="Additional Documents"
        subtitle={documents.length > 0 ? `${documents.length} files uploaded` : "Upload files or research URLs"}
        open={uploadsOpen}
        onToggle={() => setUploadsOpen(!uploadsOpen)}
      >
        {/* URL Research */}
        <div className="space-y-3 mb-4">
          <label className="text-xs font-medium text-muted uppercase tracking-wider">
            Research a Website
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={researchUrlInput}
              onChange={(e) => setResearchUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !researching && handleResearchUrl()}
              placeholder="https://example.com/about"
              className="flex-1 bg-card-lighter border border-border rounded-[8px] px-3 py-2 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
              disabled={researching}
            />
            <motion.button
              onClick={handleResearchUrl}
              disabled={researching || !researchUrlInput.trim()}
              className="px-4 py-2 bg-accent text-white font-medium rounded-[8px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {researching ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
              Research
            </motion.button>
          </div>
          <AnimatePresence>
            {researching && (
              <ProcessingBanner
                message="Researching URL..."
                detail={`Crawling and synthesizing content from ${researchUrlInput}`}
                variant="default"
              />
            )}
          </AnimatePresence>
          {researchMessage && (
            <p className={`text-xs ${researchMessage.startsWith("Failed") ? "text-error" : "text-success"}`}>
              {researchMessage}
            </p>
          )}
        </div>

        {/* Upload */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted uppercase tracking-wider block mb-2">
            Upload Documents
          </label>
          <FileUpload onUpload={handleUpload} uploading={uploading} />
        </div>

        {/* Document list */}
        {documents.length > 0 && (
          <div className="bg-card-lighter rounded-[12px] border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border">
              <span className="text-xs font-medium text-white">
                {documents.length} file{documents.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="divide-y divide-border">
              {documents.map((doc) => (
                <div
                  key={doc.filename}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-card transition-colors"
                >
                  <div>
                    <p className="text-sm text-white">{doc.filename}</p>
                    <p className="text-xs text-muted">{formatSize(doc.size)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(doc.filename.endsWith(".md") || doc.filename.endsWith(".txt")) && (
                      <button onClick={() => handleOpenEditor(doc.filename)} className="text-muted hover:text-accent transition-colors p-1" title="Edit">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    <button onClick={() => handleDeleteDocument(doc.filename)} className="text-muted hover:text-error transition-colors p-1" title="Delete">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* ═══════════════ VECTOR DB STATUS ═══════════════ */}
      <AnimatePresence>
        {loadingKB && (
          <ProcessingBanner
            message="Indexing Knowledge Base..."
            detail="Building vector database for fast retrieval — this may take a moment"
            variant="indexing"
          />
        )}
      </AnimatePresence>
      {!loadingKB && project?.kb_status === "ready" && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 rounded-[12px] border border-emerald-500/20">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs text-emerald-300">
            Vector DB ready ({project?.kb_doc_count} documents indexed)
          </span>
        </div>
      )}

      {/* Spacer for floating mobile bar */}
      <div className="h-28 md:hidden" />

      {/* ═══════════════ NAVIGATION — floating bar on mobile (sits above browser chrome) ═══════════════ */}
      <div className="fixed bottom-[4.5rem] left-3 right-3 z-40 bg-[#161b22] border border-accent/40 rounded-2xl px-5 py-3 shadow-[0_4px_30px_rgba(0,130,243,0.25)] md:static md:bg-transparent md:border-0 md:rounded-none md:px-0 md:py-0 md:shadow-none md:bottom-auto md:left-auto md:right-auto">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <motion.button
            onClick={() => router.push(`/projects/${projectId}/setup`)}
            className="px-4 py-2.5 bg-card border border-border text-white font-medium rounded-[10px] hover:border-muted transition-all text-sm flex items-center gap-1.5 md:gap-2 md:px-5"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden md:inline">Back to Setup</span>
            <span className="md:hidden">Back</span>
          </motion.button>

          <div className="flex items-center gap-2 md:gap-3">
            {kbFiles.length === 0 && documents.length === 0 && (
              <motion.button
                onClick={() => router.push(`/projects/${projectId}/optimize`)}
                className="px-4 py-2.5 bg-card border border-border text-muted font-medium rounded-[10px] hover:border-muted hover:text-white transition-all text-sm md:px-5"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Skip
              </motion.button>
            )}
            <motion.button
              onClick={() => router.push(`/projects/${projectId}/optimize`)}
              className="px-5 py-2.5 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all text-sm flex items-center gap-1.5 md:gap-2 md:px-8"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="hidden md:inline">Continue to Optimize</span>
              <span className="md:hidden">Continue</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </motion.button>
          </div>
        </div>
      </div>

      {/* ═══════════════ DOCUMENT EDITOR MODAL ═══════════════ */}
      <AnimatePresence>
        {editorOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && handleEditorClose()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-4xl max-h-[85vh] bg-card rounded-[20px] border border-border flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-white">{editorFilename}</h3>
                  <p className="text-xs text-muted">{editorDirty ? "Unsaved changes" : "Saved"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadMarkdown(editorFilename, editorContent)}
                    className="px-3 py-1.5 text-xs text-muted border border-border rounded-lg hover:text-white hover:border-muted transition-all"
                  >
                    Download
                  </button>
                  <button
                    onClick={handleEditorSave}
                    disabled={editorSaving || !editorDirty}
                    className="px-3 py-1.5 text-xs text-white bg-accent rounded-lg hover:bg-accent-hover transition-all disabled:opacity-50"
                  >
                    {editorSaving ? "Saving..." : "Save"}
                  </button>
                  <button onClick={handleEditorClose} className="text-muted hover:text-white transition-colors p-1 ml-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-4">
                <textarea
                  value={editorContent}
                  onChange={(e) => { setEditorContent(e.target.value); setEditorDirty(true); }}
                  className="w-full h-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-white font-mono leading-relaxed focus:outline-none focus:border-accent transition-colors resize-none"
                  spellCheck={false}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Collapsible Section Component ──

function CollapsibleSection({
  title,
  subtitle,
  open,
  onToggle,
  badge,
  disabled,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  badge?: "complete" | "building";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-card rounded-[20px] border border-border overflow-hidden ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-card-lighter/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {badge === "complete" && (
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          {badge === "building" && (
            <div className="w-6 h-6 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
              <div className="w-3.5 h-3.5 border-2 border-warning border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <div className="text-left">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            <p className="text-xs text-muted">{subtitle}</p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
