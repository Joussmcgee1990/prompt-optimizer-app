"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  getProject,
  getEvalItems,
  saveEvalItems,
  streamEvaluation,
  type Project,
  type EvalItem,
} from "@/lib/api";
import EvalConfig from "@/components/eval-config";
import ScoreCard from "@/components/score-card";

interface EvalResult {
  question: string;
  answer: string;
  score: number;
  facts: { fact: string; found: boolean; explanation: string }[];
}

export default function EvaluatePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [evalItems, setEvalItems] = useState<EvalItem[]>([
    { question: "", required_facts: ["", "", ""] },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalScore, setTotalScore] = useState<number | null>(null);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [failureReasons, setFailureReasons] = useState<string[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadData();
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, [projectId]);

  async function loadData() {
    try {
      const [p, items] = await Promise.all([
        getProject(projectId),
        getEvalItems(projectId),
      ]);
      setProject(p);
      if (items.items.length > 0) {
        setEvalItems(items.items);
      }
    } catch (err) {
      console.error("Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveItems() {
    setSaving(true);
    try {
      const validItems = evalItems.filter(
        (item) =>
          item.question.trim() &&
          item.required_facts.some((f) => f.trim())
      );
      await saveEvalItems(projectId, validItems);
    } catch (err) {
      console.error("Failed to save eval items:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleRunEval() {
    // Save items first
    const validItems = evalItems.filter(
      (item) =>
        item.question.trim() && item.required_facts.some((f) => f.trim())
    );
    if (validItems.length === 0) return;

    await saveEvalItems(projectId, validItems);

    setRunning(true);
    setProgress(0);
    setTotalScore(null);
    setResults([]);
    setFailureReasons([]);

    const cleanup = streamEvaluation(
      projectId,
      (event) => {
        if (event.type === "progress") {
          setProgress(event.current as number);
        } else if (event.type === "result") {
          setResults((prev) => [...prev, event as unknown as EvalResult]);
        } else if (event.type === "complete") {
          setTotalScore(event.total_score as number);
          setResults(event.results as EvalResult[]);
          setFailureReasons((event.failure_reasons as string[]) || []);
          setRunning(false);
        }
      },
      () => setRunning(false),
      (err) => {
        console.error("Eval stream error:", err);
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

  const validItemCount = evalItems.filter(
    (item) => item.question.trim() && item.required_facts.some((f) => f.trim())
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-2xl font-bold text-white">Evaluate Prompt</h1>
        <p className="text-sm text-muted mt-1">
          Define questions and required facts to measure how well your prompt
          performs.
        </p>
      </div>

      {/* Eval Items Editor */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            Evaluation Questions
          </h2>
          <motion.button
            onClick={handleSaveItems}
            disabled={saving}
            className="px-4 py-1.5 text-xs text-accent border border-accent/30 rounded-lg hover:bg-accent/10 transition-all disabled:opacity-50"
            whileTap={{ scale: 0.95 }}
          >
            {saving ? "Saving..." : "Save"}
          </motion.button>
        </div>
        <EvalConfig
          items={evalItems}
          onChange={setEvalItems}
          disabled={running}
        />
      </div>

      {/* Run Button */}
      <div className="flex justify-center">
        <motion.button
          onClick={handleRunEval}
          disabled={running || validItemCount === 0}
          className="px-10 py-3.5 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {running ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Evaluating ({progress}/{validItemCount})...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run Evaluation ({validItemCount} questions)
            </>
          )}
        </motion.button>
      </div>

      {/* Results */}
      <AnimatePresence>
        {(totalScore !== null || results.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Overall Score */}
            {totalScore !== null && (
              <div className="bg-card rounded-[20px] p-8 border border-border flex flex-col items-center">
                <ScoreCard score={totalScore} label="Overall Score" size="lg" />
                {failureReasons.length > 0 && (
                  <div className="mt-6 w-full max-w-lg">
                    <h3 className="text-xs font-medium text-error uppercase tracking-wider mb-2">
                      Failure Reasons
                    </h3>
                    <ul className="space-y-1">
                      {failureReasons.map((reason, i) => (
                        <li key={i} className="text-sm text-muted flex items-start gap-2">
                          <span className="text-error mt-0.5">-</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Per-Question Results */}
            {results.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Detailed Results
                </h2>
                {results.map((result, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-card rounded-[16px] border border-border p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-1 rounded-md shrink-0">
                          Q{i + 1}
                        </span>
                        <span className="text-sm text-white">
                          {result.question}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-bold shrink-0 ${
                          result.score >= 0.8
                            ? "text-success"
                            : result.score >= 0.5
                              ? "text-warning"
                              : "text-error"
                        }`}
                      >
                        {Math.round(result.score * 100)}%
                      </span>
                    </div>

                    {/* Facts */}
                    <div className="space-y-1.5 pl-9">
                      {result.facts.map((fact, fi) => (
                        <div
                          key={fi}
                          className="flex items-start gap-2 text-sm"
                        >
                          {fact.found ? (
                            <svg className="w-4 h-4 text-success shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-error shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          <span className={fact.found ? "text-muted" : "text-error/80"}>
                            {fact.fact}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Answer preview */}
                    <details className="pl-9">
                      <summary className="text-xs text-muted cursor-pointer hover:text-white transition-colors">
                        View RAG answer
                      </summary>
                      <p className="mt-2 text-xs text-muted/80 bg-background rounded-lg p-3 leading-relaxed">
                        {result.answer}
                      </p>
                    </details>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <motion.button
          onClick={() => router.push(`/projects/${projectId}/documents`)}
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
          onClick={() => router.push(`/projects/${projectId}/optimize`)}
          disabled={totalScore === null}
          className="px-8 py-2.5 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Continue to Optimize
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </motion.button>
      </div>
    </motion.div>
  );
}
