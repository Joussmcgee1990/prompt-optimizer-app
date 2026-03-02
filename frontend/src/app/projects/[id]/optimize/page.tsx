"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  getProject,
  streamOptimization,
  getHistory,
  type Project,
  type OptimizationRun,
} from "@/lib/api";
import PromptEditor from "@/components/prompt-editor";
import ScoreCard from "@/components/score-card";

interface IterationInfo {
  iteration: number;
  score: number;
  status: "running" | "complete";
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
      setHistory(h.optimization_runs || []);
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
          case "iteration_start":
            setCurrentIteration(event.iteration as number);
            setStatusMessage(
              `Running iteration ${event.iteration}...`
            );
            break;

          case "iteration_complete":
            setIterations((prev) => [
              ...prev,
              {
                iteration: event.iteration as number,
                score: event.score as number,
                status: "complete",
              },
            ]);
            setStatusMessage(
              `Iteration ${event.iteration}: Score ${Math.round((event.score as number) * 100)}%`
            );
            break;

          case "optimizing":
            setStatusMessage("Claude is analyzing failures and rewriting the prompt...");
            break;

          case "complete":
            setOptimizedPrompt(event.final_prompt as string);
            setFinalScore(event.final_score as number);
            setStatusMessage("Optimization complete!");
            setRunning(false);
            // Reload project to get updated prompt
            getProject(projectId).then(setProject);
            break;

          case "max_retries":
            setOptimizedPrompt(event.final_prompt as string);
            setFinalScore(event.final_score as number);
            setStatusMessage(
              `Max iterations reached. Best score: ${Math.round((event.final_score as number) * 100)}%`
            );
            setRunning(false);
            getProject(projectId).then(setProject);
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
          Let Claude analyze your evaluation failures and iteratively improve your
          prompt template.
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
      <div className="flex justify-center">
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Start Auto-Optimization
            </>
          )}
        </motion.button>
      </div>

      {/* Progress */}
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
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                )}
                <span className="text-sm text-white">{statusMessage}</span>
              </div>
            </div>

            {/* Iteration Timeline */}
            {iterations.length > 0 && (
              <div className="bg-card rounded-[20px] p-6 border border-border space-y-3">
                <h3 className="text-xs font-medium text-muted uppercase tracking-wider">
                  Optimization Progress
                </h3>
                <div className="space-y-2">
                  {iterations.map((iter, i) => (
                    <motion.div
                      key={iter.iteration}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-4"
                    >
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            i === iterations.length - 1 && !running
                              ? "bg-accent text-white"
                              : "bg-card-lighter text-muted"
                          }`}
                        >
                          {iter.iteration}
                        </div>
                        <span className="text-xs text-muted">
                          Iteration {iter.iteration}
                        </span>
                      </div>

                      {/* Score bar */}
                      <div className="flex-1 h-2 bg-card-lighter rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${
                            iter.score >= 0.8
                              ? "bg-success"
                              : iter.score >= 0.5
                                ? "bg-warning"
                                : "bg-error"
                          }`}
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.round(iter.score * 100)}%`,
                          }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>

                      <span
                        className={`text-sm font-bold w-12 text-right ${
                          iter.score >= 0.8
                            ? "text-success"
                            : iter.score >= 0.5
                              ? "text-warning"
                              : "text-error"
                        }`}
                      >
                        {Math.round(iter.score * 100)}%
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

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
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            Past Optimization Runs
          </h2>
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
                      {run.iterations} iteration{run.iterations !== 1 ? "s" : ""}
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
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
