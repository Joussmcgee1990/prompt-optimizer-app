const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";

// ── Session ────────────────────────────────────────────────────

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("pbo_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("pbo_session_id", id);
  }
  return id;
}

function sessionHeaders(): Record<string, string> {
  const sid = getSessionId();
  return sid ? { "X-Session-ID": sid } : {};
}

// ── Types ──────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  prompt_template: string;
  kb_status: string;
  kb_doc_count: number;
  kb_build_status: string;
  goal_answers: string;
  goal_definition: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentInfo {
  filename: string;
  size: number;
  uploaded_at: string;
}

export interface EvalItem {
  question: string;
  required_facts: string[];
}

export interface FactResult {
  fact: string;
  found: boolean;
  explanation: string;
}

export interface QuestionResult {
  question: string;
  answer: string;
  score: number;
  facts: FactResult[];
}

export interface EvalRun {
  id: string;
  prompt_template: string;
  score: number;
  results: QuestionResult[];
  failure_reasons: string[];
  created_at: string;
}

export interface OptimizationRun {
  id: string;
  initial_prompt: string;
  final_prompt: string | null;
  final_score: number | null;
  iterations: number;
  status: string;
  created_at: string;
}

// ── Project CRUD ───────────────────────────────────────────────

export async function createProject(data: {
  name: string;
  description: string;
  prompt_template?: string;
}): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateProject(
  id: string,
  data: Partial<Pick<Project, "name" | "description" | "prompt_template">>
): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Prompt Generation ─────────────────────────────────────────

export async function generatePromptTemplate(
  projectId: string,
  name?: string,
  description?: string
): Promise<{ prompt_template: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/generate-prompt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionHeaders() },
      body: JSON.stringify({ name: name || "", description: description || "" }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Goal Definition ───────────────────────────────────────────

export interface GoalQuestion {
  id: string;
  question: string;
  hint?: string;
  category?: string;
}

export interface GoalAnswer {
  id: string;
  question: string;
  answer: string;
}

export async function getGoalQuestions(
  projectId: string
): Promise<{ questions: GoalQuestion[] }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/goal/questions`,
    { method: "POST", headers: { ...sessionHeaders() } }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveGoal(
  projectId: string,
  answers: GoalAnswer[]
): Promise<{ goal_definition: string; status: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/goal/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getGoal(
  projectId: string
): Promise<{ answers: GoalAnswer[]; goal_definition: string; has_goal: boolean }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/goal`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateGoal(
  projectId: string,
  goalDefinition: string
): Promise<{ goal_definition: string; status: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/goal`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ goal_definition: goalDefinition }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── System Documents ──────────────────────────────────────────

export async function generateSystemDocs(
  projectId: string
): Promise<{ system_docs: { filename: string; label: string; size: number }[]; count: number }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/kb/system-docs`, {
    method: "POST",
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function streamSystemDocs(
  projectId: string,
  onEvent: (event: Record<string, unknown>) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  const sid = getSessionId();
  const url = `${API_BASE}/projects/${projectId}/kb/system-docs/stream${sid ? `?session_id=${sid}` : ""}`;
  const eventSource = new EventSource(url);

  const handleEvent = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
      if (data.type === "sysdoc_complete" || data.type === "error") {
        eventSource.close();
        onDone();
      }
    } catch (err) {
      console.error("SSE parse error:", err);
    }
  };

  const eventTypes = [
    "sysdoc_start", "sysdoc_file_start", "sysdoc_file_complete",
    "sysdoc_file_skip", "sysdoc_file_error", "sysdoc_complete", "stream_error",
  ];
  eventTypes.forEach((type) => eventSource.addEventListener(type, handleEvent));

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      onError(new Error("SSE connection error"));
    }
  };

  return () => eventSource.close();
}

// ── Documents ──────────────────────────────────────────────────

export async function uploadDocuments(
  projectId: string,
  files: File[]
): Promise<{ uploaded: { filename: string; size: number }[]; count: number }> {
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  const res = await fetch(`${API_BASE}/projects/${projectId}/documents`, {
    method: "POST",
    headers: { ...sessionHeaders() },
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listDocuments(
  projectId: string
): Promise<{ documents: DocumentInfo[]; count: number }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/documents`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDocument(
  projectId: string,
  filename: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/documents/${filename}`,
    { method: "DELETE", headers: { ...sessionHeaders() } }
  );
  if (!res.ok) throw new Error(await res.text());
}

export async function loadData(
  projectId: string
): Promise<{ status: string; message: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/documents/load-data`,
    { method: "POST", headers: { ...sessionHeaders() } }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function researchUrl(
  projectId: string,
  url: string
): Promise<{ filename: string; url: string; content_length: number; content: string; message: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/documents/research-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionHeaders() },
      body: JSON.stringify({ url }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDocumentContent(
  projectId: string,
  filename: string
): Promise<{ filename: string; content: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/documents/${encodeURIComponent(filename)}/content`,
    { headers: { ...sessionHeaders() } }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateDocumentContent(
  projectId: string,
  filename: string,
  content: string
): Promise<{ filename: string; size: number }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/documents/${encodeURIComponent(filename)}/content`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...sessionHeaders() },
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Eval Items ─────────────────────────────────────────────────

export async function saveEvalItems(
  projectId: string,
  items: EvalItem[]
): Promise<{ saved: number }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/eval-items`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getEvalItems(
  projectId: string
): Promise<{ items: EvalItem[] }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/eval-items`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function autoGenerateEvalItems(
  projectId: string,
  numQuestions: number = 5
): Promise<{ items: EvalItem[]; count: number; source: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/eval-items/auto-generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionHeaders() },
      body: JSON.stringify({ num_questions: numQuestions }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Evaluation SSE ─────────────────────────────────────────────

export function streamEvaluation(
  projectId: string,
  onEvent: (event: Record<string, unknown>) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  varianceDetection: boolean = false,
): () => void {
  const sid = getSessionId();
  const params = new URLSearchParams();
  if (sid) params.set("session_id", sid);
  if (varianceDetection) params.set("variance_detection", "true");
  const qs = params.toString();
  const url = `${API_BASE}/projects/${projectId}/evaluate/stream${qs ? `?${qs}` : ""}`;
  const eventSource = new EventSource(url);

  const handleEvent = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
      if (data.type === "complete" || data.type === "error") {
        eventSource.close();
        onDone();
      }
    } catch (err) {
      console.error("SSE parse error:", err);
    }
  };

  eventSource.addEventListener("progress", handleEvent);
  eventSource.addEventListener("result", handleEvent);
  eventSource.addEventListener("complete", handleEvent);
  eventSource.addEventListener("eval_error", handleEvent);
  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      onError(new Error("SSE connection error"));
    }
  };

  return () => eventSource.close();
}

// ── Optimization SSE ───────────────────────────────────────────

export function streamOptimization(
  projectId: string,
  onEvent: (event: Record<string, unknown>) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  const sid = getSessionId();
  const url = `${API_BASE}/projects/${projectId}/optimize/stream${sid ? `?session_id=${sid}` : ""}`;
  const eventSource = new EventSource(url);

  const handleEvent = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
      if (
        data.type === "complete" ||
        data.type === "max_retries" ||
        data.type === "error"
      ) {
        eventSource.close();
        onDone();
      }
    } catch (err) {
      console.error("SSE parse error:", err);
    }
  };

  eventSource.addEventListener("iteration_start", handleEvent);
  eventSource.addEventListener("eval_progress", handleEvent);
  eventSource.addEventListener("iteration_complete", handleEvent);
  eventSource.addEventListener("analyzing", handleEvent);
  eventSource.addEventListener("analysis_complete", handleEvent);
  eventSource.addEventListener("optimizing", handleEvent);
  eventSource.addEventListener("complete", handleEvent);
  eventSource.addEventListener("max_retries", handleEvent);
  eventSource.addEventListener("stream_error", handleEvent);
  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      onError(new Error("SSE connection error"));
    }
  };

  return () => eventSource.close();
}

// ── Knowledge Base Builder ─────────────────────────────────────

export interface KBFile {
  filename: string;
  label: string;
  size: number;
}

export interface AlignmentQuestion {
  id: string;
  question: string;
  target_file: string;
  user_answer: number | null;
  correction: string;
  resolved: number;
}

export interface AlignmentAnswer {
  question: string;
  target_file: string;
  answer: boolean;
  correction: string;
}

export async function startKBBuild(
  projectId: string,
  data: { urls: string[]; user_notes: string }
): Promise<{ build_id: string; slug: string; mode: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/kb/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function streamKBBuild(
  projectId: string,
  buildId: string,
  onEvent: (event: Record<string, unknown>) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  const sid = getSessionId();
  const url = `${API_BASE}/projects/${projectId}/kb/stream/${buildId}${sid ? `?session_id=${sid}` : ""}`;
  const eventSource = new EventSource(url);

  const handleEvent = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
      if (data.type === "complete" || data.type === "error") {
        eventSource.close();
        onDone();
      }
    } catch (err) {
      console.error("SSE parse error:", err);
    }
  };

  const eventTypes = [
    "build_start", "fetch_start", "fetch_complete", "fetch_error",
    "crawl_page", "crawl_discovery",
    "research_start", "research_complete", "research_error",
    "file_start", "file_complete", "file_error",
    "eval_start", "eval_complete", "complete", "stream_error",
  ];
  eventTypes.forEach((type) => eventSource.addEventListener(type, handleEvent));

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      onError(new Error("SSE connection error"));
    }
  };

  return () => eventSource.close();
}

export async function listKBFiles(
  projectId: string
): Promise<{ files: KBFile[]; slug: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/kb/files`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getKBFileContent(
  projectId: string,
  filename: string
): Promise<{ filename: string; content: string; slug: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/kb/files/${encodeURIComponent(filename)}`,
    { headers: { ...sessionHeaders() } }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateKBFileContent(
  projectId: string,
  filename: string,
  content: string
): Promise<{ filename: string; size: number }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/kb/files/${encodeURIComponent(filename)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...sessionHeaders() },
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getKBAlignment(
  projectId: string
): Promise<{ questions: AlignmentQuestion[]; build_id: string | null; slug: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/kb/alignment`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function submitAlignment(
  projectId: string,
  answers: AlignmentAnswer[]
): Promise<{ results: Record<string, unknown>[]; all_resolved: boolean }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/kb/align`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getKBStatus(
  projectId: string
): Promise<{ status: string; build: Record<string, unknown> | null }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/kb/status`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Blind A/B Comparison ────────────────────────────────────────

export interface ComparisonDimension {
  before: number;
  after: number;
}

export interface ComparisonQuestionResult {
  question: string;
  blind_winner: "A" | "B" | "tie";
  real_winner: "before" | "after" | "tie";
  dimensions: Record<string, ComparisonDimension>;
  reasoning: string;
  error?: string;
}

export interface ComparisonSummary {
  overall_winner: "before" | "after" | "tie";
  after_wins: number;
  before_wins: number;
  ties: number;
  dimension_averages: Record<string, ComparisonDimension>;
  question_results: ComparisonQuestionResult[];
}

export function streamComparison(
  projectId: string,
  onEvent: (event: Record<string, unknown>) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  optimizationRunId?: string,
): () => void {
  const sid = getSessionId();
  let url = `${API_BASE}/projects/${projectId}/compare/stream`;
  const params = new URLSearchParams();
  if (sid) params.set("session_id", sid);
  if (optimizationRunId) params.set("optimization_run_id", optimizationRunId);
  const qs = params.toString();
  if (qs) url += `?${qs}`;

  const eventSource = new EventSource(url);

  const handleEvent = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
      if (data.type === "comparison_complete" || data.type === "error") {
        eventSource.close();
        onDone();
      }
    } catch (err) {
      console.error("SSE parse error:", err);
    }
  };

  const eventTypes = [
    "comparison_start", "comparison_generating", "comparison_judging",
    "comparison_question_complete", "comparison_complete", "stream_error",
  ];
  eventTypes.forEach((type) => eventSource.addEventListener(type, handleEvent));

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      onError(new Error("SSE connection error"));
    }
  };

  return () => eventSource.close();
}

export async function getLatestComparison(
  projectId: string,
): Promise<{ comparison: ComparisonSummary | null }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/compare/latest`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Export ─────────────────────────────────────────────────────

export async function exportProject(projectId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/export`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="(.+)"/);
  a.download = match?.[1] || "project_export.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── History ────────────────────────────────────────────────────

export async function getHistory(projectId: string): Promise<{
  eval_runs: EvalRun[];
  optimization_runs: OptimizationRun[];
}> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/history`, {
    headers: { ...sessionHeaders() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
