"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  getProject,
  streamOptimization,
  streamComparison,
  getLatestComparison,
  getHistory,
  exportProject,
  getEvalItems,
  saveEvalItems,
  autoGenerateEvalItems,
  type Project,
  type OptimizationRun,
  type ComparisonSummary,
  type ComparisonQuestionResult,
  type EvalItem,
} from "@/lib/api";
import PromptEditor from "@/components/prompt-editor";
import EvalConfig from "@/components/eval-config";
import ScoreCard from "@/components/score-card";
import ModelBadge from "@/components/model-badge";
import ProcessingBanner from "@/components/processing-banner";

interface FailureAnalysis {
  categories: Record<string, { count: number; patterns: string[]; severity: number }>;
  suggestions: string[];
  summary: string;
}

interface IterationInfo {
  iteration: number;
  score: number | null;
  status: "evaluating" | "analyzing" | "optimizing" | "complete";
  evalProgress?: { current: number; total: number; question?: string; questionScore?: number };
  analysis?: FailureAnalysis;
}

export default function OptimizePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [iterations, setIterations] = useState<IterationInfo[]>([]);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [optimizedPrompt, setOptimizedPrompt] = useState<string | null>(null);
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [history, setHistory] = useState<OptimizationRun[]>([]);
  const [exporting, setExporting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [comparisonProgress, setComparisonProgress] = useState<{
    current: number;
    total: number;
    phase: string;
    question?: string;
  } | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ComparisonSummary | null>(null);
  const [showComparisonDetails, setShowComparisonDetails] = useState(false);
  const [evalItems, setEvalItems] = useState<EvalItem[]>([]);
  const [evalSaving, setEvalSaving] = useState(false);
  const [evalGenerating, setEvalGenerating] = useState(false);
  const [evalSource, setEvalSource] = useState<string | null>(null);
  const [criteriaExpanded, setCriteriaExpanded] = useState(true);
  const cleanupRef = useRef<(() => void) | null>(null);
  const comparisonCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadData();
    return () => {
      if (cleanupRef.current) cleanupRef.current();
      if (comparisonCleanupRef.current) comparisonCleanupRef.current();
    };
  }, [projectId]);

  async function loadData() {
    try {
      const [p, h, comp, evalData] = await Promise.all([
        getProject(projectId),
        getHistory(projectId),
        getLatestComparison(projectId).catch(() => ({ comparison: null })),
        getEvalItems(projectId).catch(() => ({ items: [] })),
      ]);
      setProject(p);
      const runs = h.optimization_runs || [];
      setHistory(runs);

      if (comp.comparison) {
        setComparisonResult(comp.comparison as ComparisonSummary);
      }

      // Load eval items — collapse criteria section if items already exist
      const items = evalData.items || [];
      setEvalItems(items);
      if (items.length > 0) {
        setCriteriaExpanded(false);
      }

      // Restore the latest completed optimization result
      const latestCompleted = runs.find(
        (r: OptimizationRun) => r.status === "completed" && r.final_prompt
      );
      if (latestCompleted && latestCompleted.final_prompt) {
        setOptimizedPrompt(latestCompleted.final_prompt);
        setFinalScore(latestCompleted.final_score);
        // Store original prompt from that run for comparison
        if (latestCompleted.initial_prompt) {
          setOriginalPrompt(latestCompleted.initial_prompt);
        }
      }
    } catch (err) {
      console.error("Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoGenerate() {
    setEvalGenerating(true);
    try {
      const result = await autoGenerateEvalItems(projectId, 5);
      setEvalItems(result.items);
      setEvalSource(result.source);
    } catch (err) {
      console.error("Failed to auto-generate eval items:", err);
    } finally {
      setEvalGenerating(false);
    }
  }

  async function handleSaveEvalItems() {
    // Filter out completely empty items
    const validItems = evalItems.filter(
      (item) => item.question.trim() || item.required_facts.some((f) => f.trim())
    );
    setEvalSaving(true);
    try {
      await saveEvalItems(projectId, validItems);
      setEvalItems(validItems);
    } catch (err) {
      console.error("Failed to save eval items:", err);
    } finally {
      setEvalSaving(false);
    }
  }

  async function handleOptimize() {
    // Auto-save eval items before starting
    const validItems = evalItems.filter(
      (item) => item.question.trim() && item.required_facts.some((f) => f.trim())
    );
    if (validItems.length > 0) {
      try {
        await saveEvalItems(projectId, validItems);
        setEvalItems(validItems);
      } catch (err) {
        console.error("Failed to save eval items before optimization:", err);
      }
    }
    setCriteriaExpanded(false);

    // Capture the original prompt before optimization starts
    setOriginalPrompt(project?.prompt_template || "");

    setRunning(true);
    setIterations([]);
    setCurrentIteration(0);
    setOptimizedPrompt(null);
    setFinalScore(null);
    setStatusMessage("Starting optimization...");

    const cleanup = streamOptimization(
      projectId,
      (event) => {
        switch (event.type) {
          case "iteration_start": {
            const iter = event.iteration as number;
            const totalQ = (event.total_questions as number) || 0;
            setCurrentIteration(iter);
            setIterations((prev) => [
              ...prev,
              {
                iteration: iter,
                score: null,
                status: "evaluating",
                evalProgress: { current: 0, total: totalQ },
              },
            ]);
            setStatusMessage(
              `Iteration ${iter} — evaluating prompt against ${totalQ} questions...`
            );
            break;
          }

          case "eval_progress": {
            const iter = event.iteration as number;
            const current = event.current as number;
            const total = event.total as number;
            const question = event.question as string;
            const qScore = event.question_score as number;
            const runningScore = event.running_score as number;

            setIterations((prev) =>
              prev.map((it) =>
                it.iteration === iter
                  ? {
                      ...it,
                      evalProgress: { current, total, question, questionScore: qScore },
                      score: runningScore,
                    }
                  : it
              )
            );
            setStatusMessage(
              `Iteration ${iter} — question ${current}/${total}: ${Math.round(qScore * 100)}% → running avg ${Math.round(runningScore * 100)}%`
            );
            break;
          }

          case "iteration_complete": {
            const iter = event.iteration as number;
            const score = event.score as number;
            setIterations((prev) =>
              prev.map((it) =>
                it.iteration === iter
                  ? { ...it, score, status: "complete", evalProgress: undefined }
                  : it
              )
            );
            setStatusMessage(
              `Iteration ${iter} complete — score: ${Math.round(score * 100)}%`
            );
            break;
          }

          case "analyzing": {
            const iter = event.iteration as number;
            setIterations((prev) =>
              prev.map((it) =>
                it.iteration === iter ? { ...it, status: "analyzing" } : it
              )
            );
            setStatusMessage(
              `Iteration ${iter} — analyzing failure patterns...`
            );
            break;
          }

          case "analysis_complete": {
            const iter = event.iteration as number;
            const analysis = event.analysis as FailureAnalysis;
            setIterations((prev) =>
              prev.map((it) =>
                it.iteration === iter ? { ...it, analysis } : it
              )
            );
            setStatusMessage(
              `Iteration ${iter} — analysis complete, rewriting prompt...`
            );
            break;
          }

          case "optimizing": {
            const iter = event.iteration as number;
            setIterations((prev) =>
              prev.map((it) =>
                it.iteration === iter ? { ...it, status: "optimizing" } : it
              )
            );
            setStatusMessage(
              "Claude is rewriting the prompt based on analysis..."
            );
            break;
          }

          case "complete":
            setOptimizedPrompt(event.final_prompt as string);
            setFinalScore(event.final_score as number);
            setStatusMessage("Optimization complete! Target score reached.");
            setRunning(false);
            getProject(projectId).then(setProject);
            loadData(); // refresh history
            break;

          case "max_retries":
            setOptimizedPrompt(event.final_prompt as string);
            setFinalScore(event.final_score as number);
            setStatusMessage(
              `Max iterations reached. Best score: ${Math.round((event.final_score as number) * 100)}%`
            );
            setRunning(false);
            getProject(projectId).then(setProject);
            loadData();
            break;

          case "error":
            setStatusMessage(`Error: ${event.message}`);
            setRunning(false);
            break;
        }
      },
      () => setRunning(false),
      (err) => {
        console.error("Optimization stream error:", err);
        setStatusMessage("Connection error. Please try again.");
        setRunning(false);
      }
    );

    cleanupRef.current = cleanup;
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportProject(projectId);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  function handleCompare() {
    setComparing(true);
    setComparisonResult(null);
    setComparisonProgress(null);

    const cleanup = streamComparison(
      projectId,
      (event) => {
        switch (event.type) {
          case "comparison_start":
            setComparisonProgress({
              current: 0,
              total: event.total as number,
              phase: "Starting blind A/B comparison...",
            });
            break;
          case "comparison_generating":
            setComparisonProgress({
              current: event.current as number,
              total: event.total as number,
              phase: "generating",
              question: event.question as string,
            });
            break;
          case "comparison_judging":
            setComparisonProgress({
              current: event.current as number,
              total: event.total as number,
              phase: "judging",
              question: event.question as string,
            });
            break;
          case "comparison_question_complete":
            setComparisonProgress({
              current: event.current as number,
              total: event.total as number,
              phase: "complete",
              question: event.question as string,
            });
            break;
          case "comparison_complete":
            setComparisonResult({
              overall_winner: event.overall_winner as "before" | "after" | "tie",
              after_wins: event.after_wins as number,
              before_wins: event.before_wins as number,
              ties: event.ties as number,
              dimension_averages: event.dimension_averages as Record<string, { before: number; after: number }>,
              question_results: event.question_results as ComparisonQuestionResult[],
            });
            setComparing(false);
            setComparisonProgress(null);
            break;
          case "error":
            setComparing(false);
            setComparisonProgress(null);
            break;
        }
      },
      () => setComparing(false),
      (err) => {
        console.error("Comparison stream error:", err);
        setComparing(false);
      }
    );

    comparisonCleanupRef.current = cleanup;
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
        <h1 className="text-2xl font-bold text-white">Auto-Optimize</h1>
        <p className="text-sm text-muted mt-1">
          Claude evaluates your prompt, identifies failures, rewrites it, and
          re-evaluates — up to 3 iterations until target score (80%) is reached.
        </p>
      </div>

      {/* Evaluation Criteria */}
      <div className="bg-card rounded-[20px] border border-border overflow-hidden">
        {/* Collapsible header */}
        <div
          className="flex items-center justify-between px-6 py-5 cursor-pointer hover:bg-card-lighter transition-colors"
          onClick={() => setCriteriaExpanded(!criteriaExpanded)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Evaluation Criteria</h2>
              <p className="text-xs text-muted mt-0.5">
                {evalItems.length > 0
                  ? `${evalItems.length} question${evalItems.length !== 1 ? "s" : ""} configured`
                  : "Define how your prompt will be tested"}
              </p>
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-muted transition-transform ${criteriaExpanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Expanded content */}
        <AnimatePresence>
          {criteriaExpanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 border-t border-border pt-5 space-y-4">
                {evalItems.length === 0 && !evalGenerating ? (
                  /* Empty state — auto-generate banner */
                  <div className="bg-background rounded-[16px] p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
                      <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">No evaluation criteria yet</h3>
                      <p className="text-xs text-muted mt-1">
                        Auto-generate questions from your knowledge base, or add them manually.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <motion.button
                        onClick={handleAutoGenerate}
                        className="px-5 py-2 bg-accent text-white font-medium rounded-[10px] hover:bg-accent-hover transition-all text-sm flex items-center gap-2"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Generate Questions
                      </motion.button>
                      <ModelBadge model="sonnet" />
                    </div>
                  </div>
                ) : evalGenerating ? (
                  /* Generating state */
                  <ProcessingBanner
                    message="Generating Evaluation Questions..."
                    detail="AI is analyzing your knowledge base to create test questions"
                    variant="generating"
                  />
                ) : (
                  /* Questions exist — show EvalConfig + action buttons */
                  <>
                    <EvalConfig items={evalItems} onChange={setEvalItems} disabled={running} />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <motion.button
                          onClick={handleAutoGenerate}
                          disabled={evalGenerating || running}
                          className="px-4 py-1.5 text-xs text-accent border border-accent/30 rounded-lg hover:bg-accent/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          whileTap={{ scale: 0.95 }}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Regenerate
                        </motion.button>
                        <ModelBadge model="sonnet" />
                      </div>
                      <motion.button
                        onClick={handleSaveEvalItems}
                        disabled={evalSaving || running}
                        className="px-4 py-1.5 text-xs text-white bg-card border border-border rounded-lg hover:border-muted transition-all disabled:opacity-50 flex items-center gap-1.5"
                        whileTap={{ scale: 0.95 }}
                      >
                        {evalSaving ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save Criteria"
                        )}
                      </motion.button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Current Prompt */}
      <div className="bg-card rounded-[20px] p-6 border border-border">
        <PromptEditor
          value={project?.prompt_template || ""}
          onChange={() => {}}
          disabled
          label="Current Prompt Template"
        />
      </div>

      {/* Optimize Button */}
      <div className="flex flex-col items-center gap-2">
        <motion.button
          onClick={handleOptimize}
          disabled={running || evalItems.filter((item) => item.question.trim() && item.required_facts.some((f) => f.trim())).length === 0}
          className="px-10 py-3.5 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {running ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Optimizing...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Start Auto-Optimization
            </>
          )}
        </motion.button>
        {evalItems.filter((item) => item.question.trim() && item.required_facts.some((f) => f.trim())).length === 0 && !running && (
          <p className="text-xs text-muted/60">Configure evaluation criteria above to enable optimization</p>
        )}
        <ModelBadge model="opus" />
      </div>

      {/* Live Progress */}
      <AnimatePresence>
        {(running || iterations.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Status Message */}
            <div className="bg-card rounded-[16px] p-5 border border-border">
              <div className="flex items-center gap-3">
                {running && (
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
                )}
                <span className="text-sm text-white">{statusMessage}</span>
              </div>
            </div>

            {/* Iteration Cards */}
            {iterations.map((iter, i) => (
              <motion.div
                key={`${iter.iteration}-${i}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-[20px] p-6 border border-border space-y-4"
              >
                {/* Iteration header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        iter.status === "complete" && iter.score !== null && iter.score >= 0.8
                          ? "bg-success/20 text-success"
                          : iter.status === "complete"
                            ? "bg-warning/20 text-warning"
                            : "bg-accent/20 text-accent"
                      }`}
                    >
                      {iter.iteration}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Iteration {iter.iteration}
                      </h3>
                      <span className="text-xs text-muted">
                        {iter.status === "evaluating"
                          ? "Evaluating prompt..."
                          : iter.status === "optimizing"
                            ? "Rewriting prompt with Claude..."
                            : "Complete"}
                      </span>
                    </div>
                  </div>

                  {/* Score badge */}
                  {iter.score !== null && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={`text-lg font-bold ${
                        iter.score >= 0.8
                          ? "text-success"
                          : iter.score >= 0.5
                            ? "text-warning"
                            : "text-error"
                      }`}
                    >
                      {Math.round(iter.score * 100)}%
                    </motion.span>
                  )}
                </div>

                {/* Per-question progress bar (during evaluation) */}
                {iter.evalProgress && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>
                        Question {iter.evalProgress.current}/{iter.evalProgress.total}
                      </span>
                      {iter.evalProgress.questionScore !== undefined && (
                        <span>
                          Last:{" "}
                          <span
                            className={
                              iter.evalProgress.questionScore >= 0.8
                                ? "text-success"
                                : iter.evalProgress.questionScore >= 0.5
                                  ? "text-warning"
                                  : "text-error"
                            }
                          >
                            {Math.round(iter.evalProgress.questionScore * 100)}%
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 bg-card-lighter rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-accent"
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.round(
                            (iter.evalProgress.current / iter.evalProgress.total) * 100
                          )}%`,
                        }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>

                    {/* Current question */}
                    {iter.evalProgress.question && (
                      <motion.p
                        key={iter.evalProgress.question}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-xs text-muted truncate"
                      >
                        &ldquo;{iter.evalProgress.question}&rdquo;
                      </motion.p>
                    )}
                  </div>
                )}

                {/* Score bar (after completion) */}
                {iter.status === "complete" && iter.score !== null && (
                  <div className="h-2 bg-card-lighter rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${
                        iter.score >= 0.8
                          ? "bg-success"
                          : iter.score >= 0.5
                            ? "bg-warning"
                            : "bg-error"
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(iter.score * 100)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                )}

                {/* Analyzing spinner */}
                {iter.status === "analyzing" && (
                  <div className="flex items-center gap-2 text-xs text-purple-400">
                    <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    Analyzing failure patterns...
                  </div>
                )}

                {/* Analysis Results */}
                {iter.analysis && Object.keys(iter.analysis.categories).length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-background rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                        Failure Analysis
                      </span>
                    </div>

                    {iter.analysis.summary && (
                      <p className="text-xs text-muted">{iter.analysis.summary}</p>
                    )}

                    {/* Categories */}
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(iter.analysis.categories)
                        .sort(([, a], [, b]) => b.severity - a.severity)
                        .map(([cat, data]) => (
                          <div key={cat} className="bg-card rounded-md p-2.5">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-muted capitalize">
                                {cat.replace(/_/g, " ")}
                              </span>
                              <span className={`text-[10px] font-bold ${
                                data.severity >= 4 ? "text-error" : data.severity >= 3 ? "text-warning" : "text-muted"
                              }`}>
                                {data.count} failures
                              </span>
                            </div>
                            {data.patterns.slice(0, 2).map((p, pi) => (
                              <p key={pi} className="text-[10px] text-muted/70 leading-snug">
                                • {p}
                              </p>
                            ))}
                          </div>
                        ))}
                    </div>

                    {/* Suggestions */}
                    {iter.analysis.suggestions.length > 0 && (
                      <div>
                        <span className="text-[10px] text-muted uppercase tracking-wider font-medium">
                          Top Suggestions
                        </span>
                        <ul className="mt-1 space-y-1">
                          {iter.analysis.suggestions.map((s, si) => (
                            <li key={si} className="text-[11px] text-muted/80 flex items-start gap-1.5">
                              <span className="text-accent font-bold shrink-0">{si + 1}.</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Optimizing spinner */}
                {iter.status === "optimizing" && (
                  <div className="flex items-center gap-2 text-xs text-accent">
                    <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Claude is rewriting the prompt based on analysis...
                  </div>
                )}
              </motion.div>
            ))}

            {/* Final Result */}
            {optimizedPrompt && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="bg-card rounded-[20px] p-8 border border-border flex flex-col items-center">
                  <ScoreCard
                    score={finalScore || 0}
                    label="Optimized Score"
                    size="lg"
                  />
                  <p className="mt-4 text-sm text-muted text-center">
                    {(finalScore || 0) >= 0.8
                      ? "Target score reached! Your prompt has been updated."
                      : "Below target after 3 iterations. Try running again, or manually edit the prompt in Setup to save credits."}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    {/* Keep Optimizing — run another 3 iterations from where we left off */}
                    <motion.button
                      onClick={handleOptimize}
                      disabled={running}
                      className="px-6 py-2.5 bg-accent text-white font-medium rounded-[10px] hover:bg-accent-hover transition-all text-sm flex items-center gap-2 disabled:opacity-50"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Keep Optimizing
                    </motion.button>

                    <motion.button
                      onClick={handleExport}
                      disabled={exporting}
                      className="px-6 py-2.5 bg-card border border-border text-white font-medium rounded-[10px] hover:border-muted transition-all text-sm flex items-center gap-2 disabled:opacity-50"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {exporting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download Full Package
                        </>
                      )}
                    </motion.button>

                    {!running && (
                      <motion.button
                        onClick={handleCompare}
                        disabled={comparing}
                        className="px-6 py-2.5 bg-card border border-purple-500/30 text-purple-400 font-medium rounded-[10px] hover:bg-purple-500/10 transition-all text-sm flex items-center gap-2 disabled:opacity-50"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {comparing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                            Comparing...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Run Blind A/B Comparison
                          </>
                        )}
                      </motion.button>
                    )}
                  </div>
                </div>

                {/* Comparison Progress */}
                <AnimatePresence>
                  {comparing && comparisonProgress && (
                    <ProcessingBanner
                      message={
                        comparisonProgress.phase === "generating"
                          ? `Generating answers (${comparisonProgress.current}/${comparisonProgress.total})...`
                          : comparisonProgress.phase === "judging"
                            ? `Blind judging (${comparisonProgress.current}/${comparisonProgress.total})...`
                            : `A/B Comparison: Question ${comparisonProgress.current}/${comparisonProgress.total}`
                      }
                      detail={comparisonProgress.question || "Setting up blind comparison..."}
                      variant="generating"
                    />
                  )}
                </AnimatePresence>

                {/* Comparison Results */}
                {comparisonResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card rounded-[20px] border border-border overflow-hidden"
                  >
                    {/* Header */}
                    <div className="p-6 border-b border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                            comparisonResult.overall_winner === "after"
                              ? "bg-success/20 text-success"
                              : comparisonResult.overall_winner === "before"
                                ? "bg-error/20 text-error"
                                : "bg-warning/20 text-warning"
                          }`}>
                            {comparisonResult.overall_winner === "after" ? "✓" : comparisonResult.overall_winner === "before" ? "✗" : "≈"}
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-white">
                              Blind A/B Comparison Result
                            </h3>
                            <p className="text-xs text-muted mt-0.5">
                              {comparisonResult.overall_winner === "after"
                                ? "Optimized prompt wins! Confirmed improvement."
                                : comparisonResult.overall_winner === "before"
                                  ? "Original prompt performed better in blind test."
                                  : "Prompts performed equally in blind test."}
                            </p>
                          </div>
                        </div>
                        <ModelBadge model="opus" />
                      </div>

                      {/* Win/Loss Summary */}
                      <div className="mt-4 flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">Optimized wins:</span>
                          <span className="text-sm font-bold text-success">{comparisonResult.after_wins}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">Original wins:</span>
                          <span className="text-sm font-bold text-error">{comparisonResult.before_wins}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">Ties:</span>
                          <span className="text-sm font-bold text-warning">{comparisonResult.ties}</span>
                        </div>
                      </div>
                    </div>

                    {/* Dimension Averages */}
                    <div className="p-6 border-b border-border">
                      <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                        Dimension Scores (avg, 1–5)
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(comparisonResult.dimension_averages).map(([dim, scores]) => (
                          <div key={dim} className="bg-background rounded-lg p-3">
                            <span className="text-xs text-muted capitalize block mb-1.5">
                              {dim.replace(/_/g, " ")}
                            </span>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted/60">Before</span>
                                <span className={`text-sm font-bold ${scores.before >= scores.after ? "text-warning" : "text-muted/60"}`}>
                                  {scores.before.toFixed(1)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted/60">After</span>
                                <span className={`text-sm font-bold ${scores.after >= scores.before ? "text-success" : "text-muted/60"}`}>
                                  {scores.after.toFixed(1)}
                                </span>
                              </div>
                              {scores.after > scores.before && (
                                <span className="text-[10px] text-success">+{(scores.after - scores.before).toFixed(1)}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Per-question details toggle */}
                    <div className="p-4">
                      <button
                        onClick={() => setShowComparisonDetails(!showComparisonDetails)}
                        className="w-full flex items-center justify-between text-xs text-muted hover:text-white transition-colors px-2 py-1"
                      >
                        <span>{showComparisonDetails ? "Hide" : "Show"} per-question details</span>
                        <svg
                          className={`w-4 h-4 transition-transform ${showComparisonDetails ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      <AnimatePresence>
                        {showComparisonDetails && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-3 space-y-2 overflow-hidden"
                          >
                            {comparisonResult.question_results.map((qr, idx) => (
                              <div key={idx} className="bg-background rounded-lg p-3 space-y-1.5">
                                <p className="text-xs text-white font-medium truncate">
                                  &ldquo;{qr.question}&rdquo;
                                </p>
                                <div className="flex items-center gap-3">
                                  <span className={`text-xs font-bold ${
                                    qr.real_winner === "after"
                                      ? "text-success"
                                      : qr.real_winner === "before"
                                        ? "text-error"
                                        : "text-warning"
                                  }`}>
                                    {qr.real_winner === "after"
                                      ? "✓ Optimized wins"
                                      : qr.real_winner === "before"
                                        ? "✗ Original wins"
                                        : "≈ Tie"}
                                  </span>
                                  <span className="text-[10px] text-muted/50">
                                    (blind: {qr.blind_winner})
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted/70 leading-relaxed">
                                  {qr.reasoning}
                                </p>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}

                {/* Side-by-side Prompt Comparison */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Original Prompt */}
                  <div className="bg-card rounded-[20px] p-6 border border-border">
                    <PromptEditor
                      value={originalPrompt || project?.prompt_template || ""}
                      onChange={() => {}}
                      disabled
                      label="Original Prompt"
                      badge={<span className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-muted/10 text-muted border border-border">Before</span>}
                    />
                  </div>

                  {/* Optimized Prompt */}
                  <div className="bg-card rounded-[20px] p-6 border border-accent/30">
                    <PromptEditor
                      value={optimizedPrompt}
                      onChange={() => {}}
                      disabled
                      label="Optimized Prompt"
                      badge={<span className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-accent/10 text-accent border border-accent/30">After</span>}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* History */}
      {history.length > 0 && !running && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Past Optimization Runs
            </h2>
            <motion.button
              onClick={handleExport}
              disabled={exporting}
              className="px-4 py-2 bg-card border border-border text-white font-medium rounded-[10px] hover:border-muted transition-all text-xs flex items-center gap-2 disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {exporting ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              Export Package
            </motion.button>
          </div>
          <div className="space-y-2">
            {history.map((run) => (
              <div
                key={run.id}
                className="bg-card rounded-[12px] border border-border p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`text-sm font-bold ${
                      (run.final_score || 0) >= 0.8
                        ? "text-success"
                        : (run.final_score || 0) >= 0.5
                          ? "text-warning"
                          : "text-error"
                    }`}
                  >
                    {run.final_score !== null
                      ? `${Math.round(run.final_score * 100)}%`
                      : "--"}
                  </span>
                  <div>
                    <span className="text-sm text-white">
                      {run.iterations} iteration
                      {run.iterations !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-muted ml-3 capitalize">
                      {run.status}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted">
                  {new Date(run.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <motion.button
          onClick={() => router.push(`/projects/${projectId}/knowledge-base`)}
          className="px-5 py-2.5 bg-card border border-border text-white font-medium rounded-[10px] hover:border-muted transition-all text-sm flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Knowledge Base
        </motion.button>

        <motion.button
          onClick={() => router.push("/projects")}
          className="px-5 py-2.5 bg-card border border-border text-white font-medium rounded-[10px] hover:border-muted transition-all text-sm"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          All Projects
        </motion.button>
      </div>
    </motion.div>
  );
}
