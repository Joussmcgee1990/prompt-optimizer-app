"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  getProject,
  getEvalItems,
  saveEvalItems,
  autoGenerateEvalItems,
  streamEvaluation,
  type Project,
  type EvalItem,
} from "@/lib/api";
import EvalConfig from "@/components/eval-config";
import ScoreCard from "@/components/score-card";
import ModelBadge from "@/components/model-badge";
import ProcessingBanner from "@/components/processing-banner";

interface FactResult {
  fact: string;
  found: boolean;
  explanation: string;
  confidence?: "high" | "flaky";
}

interface EvalResult {
  question: string;
  answer: string;
  score: number;
  facts: FactResult[];
}

/** Map backend fact_evaluation shape → frontend FactResult shape */
function mapFactEval(ev: Record<string, unknown>): FactResult {
  return {
    fact: (ev.fact as string) || "",
    found: !!(ev.passed ?? ev.found),
    explanation: (ev.reason as string) || (ev.explanation as string) || "",
    confidence: (ev.confidence as "high" | "flaky") || undefined,
  };
}

/** Map a backend result dict → frontend EvalResult */
function mapResult(raw: Record<string, unknown>): EvalResult {
  const factEvalsRaw = (raw.fact_evaluations || raw.facts || []) as Record<string, unknown>[];
  return {
    question: (raw.question as string) || "",
    answer: (raw.response as string) || (raw.answer as string) || "",
    score: (raw.score as number) || 0,
    facts: factEvalsRaw.map(mapFactEval),
  };
}

interface ProgressState {
  current: number;
  total: number;
  currentQuestion: string;
  questionScore: number | null;
  runningScore: number | null;
}

export default function EvaluatePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [evalItems, setEvalItems] = useState<EvalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [evalSource, setEvalSource] = useState<"knowledge_base" | "description" | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({
    current: 0,
    total: 0,
    currentQuestion: "",
    questionScore: null,
    runningScore: null,
  });
  const [totalScore, setTotalScore] = useState<number | null>(null);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [failureReasons, setFailureReasons] = useState<string[]>([]);
  const [varianceDetection, setVarianceDetection] = useState(false);
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

  async function handleAutoGenerate() {
    setGenerating(true);
    try {
      const result = await autoGenerateEvalItems(projectId, 5);
      setEvalItems(result.items);
      setEvalSource(result.source as "knowledge_base" | "description" || null);
      await saveEvalItems(projectId, result.items);
    } catch (err) {
      console.error("Failed to auto-generate:", err);
    } finally {
      setGenerating(false);
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
    const validItems = evalItems.filter(
      (item) =>
        item.question.trim() && item.required_facts.some((f) => f.trim())
    );
    if (validItems.length === 0) return;

    await saveEvalItems(projectId, validItems);

    setRunning(true);
    setProgress({ current: 0, total: validItems.length, currentQuestion: "", questionScore: null, runningScore: null });
    setTotalScore(null);
    setResults([]);
    setFailureReasons([]);

    const cleanup = streamEvaluation(
      projectId,
      (event) => {
        if (event.type === "progress") {
          // Update progress state
          setProgress({
            current: event.current as number,
            total: event.total as number,
            currentQuestion: event.question as string,
            questionScore: event.question_score as number,
            runningScore: event.running_score as number,
          });

          // Add result as it streams in
          const factEvalsRaw = (event.fact_evaluations || []) as Record<string, unknown>[];
          const streamedResult: EvalResult = {
            question: event.question as string,
            answer: "",
            score: event.question_score as number,
            facts: factEvalsRaw.map(mapFactEval),
          };
          setResults((prev) => [...prev, streamedResult]);

        } else if (event.type === "complete") {
          setTotalScore(event.total_score as number);
          const rawResults = (event.results || []) as Record<string, unknown>[];
          setResults(rawResults.map(mapResult));
          const rawReasons = (event.failure_reasons || []) as Record<string, unknown>[];
          setFailureReasons(
            rawReasons.map((r) => {
              const q = r.question as string;
              const f = r.fact as string;
              const reason = r.reason as string;
              return `${q}: ${f} — ${reason}`;
            })
          );
          setRunning(false);
        }
      },
      () => setRunning(false),
      (err) => {
        console.error("Eval stream error:", err);
        setRunning(false);
      },
      varianceDetection,
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

  const hasNoQuestions = evalItems.length === 0 || (evalItems.length === 1 && !evalItems[0]?.question?.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-2xl font-bold text-white">Pre-flight Checks</h1>
        <p className="text-sm text-muted mt-1">
          Final verification before optimization. Review the test questions below, then run the evaluation to establish a baseline score.
        </p>
      </div>

      {/* Auto-generate banner — shown when no questions exist yet */}
      {hasNoQuestions && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-accent/5 border border-accent/20 rounded-[20px] p-6 space-y-3"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white">
                Auto-Generate Test Questions
              </h3>
              <p className="text-xs text-muted mt-1">
                {project?.kb_status === "ready"
                  ? "We'll analyze your knowledge base and create test questions with specific facts that a good answer must include. You can edit them after."
                  : "We'll create starter questions based on your project description. You can refine them once you've added your knowledge base."}
              </p>
            </div>
          </div>
          {generating ? (
            <div className="pl-[52px]">
              <ProcessingBanner
                message="Generating Test Questions..."
                detail={project?.kb_status === "ready"
                  ? "Analyzing your knowledge base to create questions with verifiable facts"
                  : "Creating starter questions from your project description"}
                variant="generating"
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 pl-[52px]">
              <motion.button
                onClick={handleAutoGenerate}
                className="px-5 py-2.5 bg-accent text-white font-medium rounded-[10px] hover:bg-accent-hover transition-all text-sm flex items-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Questions
              </motion.button>
              <motion.button
                onClick={() => setEvalItems([{ question: "", required_facts: ["", "", ""] }])}
                className="px-4 py-2.5 text-sm text-muted hover:text-white transition-colors"
              >
                or write manually
              </motion.button>
              <ModelBadge model="sonnet" />
            </div>
          )}
        </motion.div>
      )}

      {/* Eval Items Editor */}
      {!hasNoQuestions && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Test Questions
              </h2>
              <span className="text-xs text-muted bg-card px-2 py-0.5 rounded-full border border-border">
                {validItemCount} question{validItemCount !== 1 ? "s" : ""}
              </span>
              {evalSource && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    evalSource === "knowledge_base"
                      ? "text-success bg-success/10 border-success/20"
                      : "text-warning bg-warning/10 border-warning/20"
                  }`}
                >
                  {evalSource === "knowledge_base"
                    ? "Generated from Knowledge Base"
                    : "Generated from description only"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                onClick={handleAutoGenerate}
                disabled={generating || running}
                className="px-4 py-1.5 text-xs text-accent border border-accent/30 rounded-lg hover:bg-accent/10 transition-all disabled:opacity-50 flex items-center gap-1.5"
                whileTap={{ scale: 0.95 }}
              >
                {generating ? (
                  <>
                    <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Regenerate
                  </>
                )}
              </motion.button>
              <motion.button
                onClick={handleSaveItems}
                disabled={saving || running}
                className="px-4 py-1.5 text-xs text-accent border border-accent/30 rounded-lg hover:bg-accent/10 transition-all disabled:opacity-50"
                whileTap={{ scale: 0.95 }}
              >
                {saving ? "Saving..." : "Save"}
              </motion.button>
            </div>
          </div>

          <div className="bg-card/50 rounded-[16px] border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-muted">
                {evalSource === "description"
                  ? "These are starter questions based on your project description. Add your knowledge base, then regenerate for more accurate questions."
                  : "Each question has 3 required facts — specific details that a good answer must include. Edit these to match your expectations."}
              </p>
            </div>
            <EvalConfig
              items={evalItems}
              onChange={setEvalItems}
              disabled={running}
            />
          </div>
        </div>
      )}

      {/* Run Button */}
      {!hasNoQuestions && (
        <div className="flex flex-col items-center gap-3">
          {/* Variance Detection Toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={varianceDetection}
                onChange={(e) => setVarianceDetection(e.target.checked)}
                disabled={running}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-border rounded-full peer-checked:bg-accent transition-colors peer-disabled:opacity-50" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted group-hover:text-white transition-colors">
                Variance Detection
              </span>
              <span className="text-[10px] text-muted/60 bg-background px-1.5 py-0.5 rounded border border-border/50">
                2× cost
              </span>
            </div>
          </label>
          {varianceDetection && (
            <p className="text-[11px] text-warning/70 text-center max-w-sm">
              Each fact will be checked twice to identify flaky results. Doubles API usage.
            </p>
          )}

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
                Running checks...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Run Pre-flight Check ({validItemCount} questions)
              </>
            )}
          </motion.button>
          <ModelBadge model="opus" />
        </div>
      )}

      {/* Live Progress Panel */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-card rounded-[20px] border border-accent/20 p-6 space-y-5"
          >
            {/* Progress header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Evaluating question {progress.current} of {progress.total}
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    Each question is queried against your knowledge base and scored on fact accuracy
                  </p>
                </div>
              </div>
              {progress.runningScore !== null && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-accent">
                    {Math.round(progress.runningScore * 100)}%
                  </div>
                  <div className="text-xs text-muted">running avg</div>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="w-full bg-background rounded-full h-2.5 overflow-hidden">
                <motion.div
                  className="h-full bg-accent rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted">
                <span>{progress.current} / {progress.total} complete</span>
                <span>{progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
              </div>
            </div>

            {/* Current question being evaluated */}
            {progress.currentQuestion && (
              <motion.div
                key={progress.currentQuestion}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-background rounded-[12px] p-4 border border-border/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-md shrink-0 mt-0.5">
                      Q{progress.current}
                    </span>
                    <span className="text-sm text-white">{progress.currentQuestion}</span>
                  </div>
                  {progress.questionScore !== null && (
                    <span
                      className={`text-sm font-bold shrink-0 ${
                        progress.questionScore >= 0.8
                          ? "text-success"
                          : progress.questionScore >= 0.5
                            ? "text-warning"
                            : "text-error"
                      }`}
                    >
                      {Math.round(progress.questionScore * 100)}%
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            {/* Mini results tally */}
            {results.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {results.map((r, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                      r.score >= 0.8
                        ? "bg-success/10 text-success border-success/20"
                        : r.score >= 0.5
                          ? "bg-warning/10 text-warning border-warning/20"
                          : "bg-error/10 text-error border-error/20"
                    }`}
                  >
                    Q{i + 1}: {Math.round(r.score * 100)}%
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Final Results */}
      <AnimatePresence>
        {!running && (totalScore !== null || results.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Overall Score */}
            {totalScore !== null && (
              <div className="bg-card rounded-[20px] p-8 border border-border flex flex-col items-center">
                <ScoreCard score={totalScore} label="Baseline Score" size="lg" />
                <p className="text-xs text-muted mt-3 max-w-md text-center">
                  {totalScore >= 0.8
                    ? "Your prompt is performing well! You can still try optimization to squeeze out more accuracy."
                    : totalScore >= 0.5
                      ? "Decent start. The optimizer should be able to improve this significantly."
                      : "There's room for improvement. The optimizer will work on addressing the failures below."}
                </p>
                {/* Flaky count if variance detection was used */}
                {results.some(r => r.facts.some(f => f.confidence)) && (
                  <div className="mt-4 flex items-center gap-3">
                    {(() => {
                      const flakyCount = results.reduce((acc, r) => acc + r.facts.filter(f => f.confidence === "flaky").length, 0);
                      const verifiedCount = results.reduce((acc, r) => acc + r.facts.filter(f => f.confidence === "high").length, 0);
                      return (
                        <>
                          <span className="text-xs text-success/70 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {verifiedCount} verified
                          </span>
                          {flakyCount > 0 && (
                            <span className="text-xs text-warning/70 flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                              {flakyCount} flaky
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {failureReasons.length > 0 && (
                  <div className="mt-6 w-full max-w-lg">
                    <h3 className="text-xs font-medium text-error uppercase tracking-wider mb-2">
                      Issues Found
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
                    {result.facts && result.facts.length > 0 && (
                      <div className="space-y-1.5 pl-9">
                        {result.facts.map((fact, fi) => (
                          <div
                            key={fi}
                            className="flex items-start gap-2 text-sm"
                          >
                            {fact.confidence === "flaky" ? (
                              <svg className="w-4 h-4 text-warning shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                            ) : fact.found ? (
                              <svg className="w-4 h-4 text-success shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-error shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={
                                  fact.confidence === "flaky"
                                    ? "text-warning/80"
                                    : fact.found
                                      ? "text-muted"
                                      : "text-error/80"
                                }>
                                  {fact.fact}
                                </span>
                                {fact.confidence === "flaky" && (
                                  <span className="text-[10px] text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                                    Flaky
                                  </span>
                                )}
                                {fact.confidence === "high" && (
                                  <span className="text-[10px] text-success/60 bg-success/5 border border-success/10 px-1.5 py-0.5 rounded-full shrink-0">
                                    Verified
                                  </span>
                                )}
                              </div>
                              {fact.explanation && (
                                <p className="text-xs text-muted/60 mt-0.5">{fact.explanation}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Answer preview */}
                    {result.answer && (
                      <details className="pl-9">
                        <summary className="text-xs text-muted cursor-pointer hover:text-white transition-colors">
                          View RAG answer
                        </summary>
                        <p className="mt-2 text-xs text-muted/80 bg-background rounded-lg p-3 leading-relaxed">
                          {result.answer}
                        </p>
                      </details>
                    )}
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
          onClick={() => router.push(`/projects/${projectId}/knowledge-base`)}
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
