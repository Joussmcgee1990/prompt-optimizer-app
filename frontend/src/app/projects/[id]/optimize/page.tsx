"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  getProject,
  streamOptimization,
  getHistory,
  exportProject,
  type Project,
  type OptimizationRun,
} from "@/lib/api";
import PromptEditor from "@/components/prompt-editor";
import ScoreCard from "@/components/score-card";
import ModelBadge from "@/components/model-badge";

interface IterationInfo {
  iteration: number;
  score: number | null;
  status: "evaluating" | "optimizing" | "complete";
  evalProgress?: { current: number; total: number; question?: string; questionScore?: number };
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
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [history, setHistory] = useState<OptimizationRun[]>([]);
  const [exporting, setExporting] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadData();
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, [projectId]);

  async function loadData() {
    try {
      const [p, h] = await Promise.all([
        getProject(projectId),
        getHistory(projectId),
      ]);
      setProject(p);
      const runs = h.optimization_runs || [];
      setHistory(runs);

      // Restore the latest completed optimization result
      const latestCompleted = runs.find(
        (r: OptimizationRun) => r.status === "completed" && r.final_prompt
      );
      if (latestCompleted && latestCompleted.final_prompt) {
        setOptimizedPrompt(latestCompleted.final_prompt);
        setFinalScore(latestCompleted.final_score);
      }
    } catch (err) {
      console.error("Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleOptimize() {
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

          case "optimizing": {
            const iter = event.iteration as number;
            setIterations((prev) =>
              prev.map((it) =>
                it.iteration === iter ? { ...it, status: "optimizing" } : it
              )
            );
            setStatusMessage(
              "Claude is analyzing failures and rewriting the prompt..."
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
          disabled={running}
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

                {/* Optimizing spinner */}
                {iter.status === "optimizing" && (
                  <div className="flex items-center gap-2 text-xs text-accent">
                    <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Claude is analyzing failures and rewriting the prompt...
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
                      : "Best score achieved after maximum iterations. Your prompt has been updated."}
                  </p>
                  <motion.button
                    onClick={handleExport}
                    disabled={exporting}
                    className="mt-4 px-6 py-2.5 bg-accent text-white font-medium rounded-[10px] hover:bg-accent-hover transition-all text-sm flex items-center gap-2 disabled:opacity-50"
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
                </div>

                <div className="bg-card rounded-[20px] p-6 border border-border">
                  <PromptEditor
                    value={optimizedPrompt}
                    onChange={() => {}}
                    disabled
                    label="Optimized Prompt"
                  />
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
          onClick={() => router.push(`/projects/${projectId}/evaluate`)}
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
          Back to Evaluate
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
