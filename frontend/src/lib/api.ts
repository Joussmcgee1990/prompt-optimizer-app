const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";

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
  original_prompt: string;
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateProject(
  id: string,
  data: Partial<Pick<Project, "name" | "description" | "prompt_template">>
): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
    { method: "POST" }
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getGoal(
  projectId: string
): Promise<{ answers: GoalAnswer[]; goal_definition: string; has_goal: boolean }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/goal`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateGoal(
  projectId: string,
  goalDefinition: string
): Promise<{ goal_definition: string; status: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/goal`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
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
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listDocuments(
  projectId: string
): Promise<{ documents: DocumentInfo[]; count: number }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/documents`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDocument(
  projectId: string,
  filename: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/documents/${filename}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await res.text());
}

export async function loadData(
  projectId: string
): Promise<{ status: string; message: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/documents/load-data`,
    { method: "POST" }
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
      headers: { "Content-Type": "application/json" },
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
    `${API_BASE}/projects/${projectId}/documents/${encodeURIComponent(filename)}/content`
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
      headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getEvalItems(
  projectId: string
): Promise<{ items: EvalItem[] }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/eval-items`);
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
      headers: { "Content-Type": "application/json" },
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
  onError: (err: Error) => void
): () => void {
  const eventSource = new EventSource(
    `${API_BASE}/projects/${projectId}/evaluate/stream`
  );

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
  // Backend sends errors as "eval_error" to avoid conflicting with EventSource's
  // built-in "error" event which kills the connection
  eventSource.addEventListener("eval_error", handleEvent);
  // Connection-level errors only (not backend errors)
  eventSource.onerror = () => {
    // EventSource fires onerror on connection close too — only treat as
    // error if we haven't received a complete event (readyState CLOSED = 2)
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
  const eventSource = new EventSource(
    `${API_BASE}/projects/${projectId}/optimize/stream`
  );

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
    headers: { "Content-Type": "application/json" },
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
  const eventSource = new EventSource(
    `${API_BASE}/projects/${projectId}/kb/stream/${buildId}`
  );

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
  const res = await fetch(`${API_BASE}/projects/${projectId}/kb/files`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getKBFileContent(
  projectId: string,
  filename: string
): Promise<{ filename: string; content: string; slug: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/kb/files/${encodeURIComponent(filename)}`
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getKBAlignment(
  projectId: string
): Promise<{ questions: AlignmentQuestion[]; build_id: string | null; slug: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/kb/alignment`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function submitAlignment(
  projectId: string,
  answers: AlignmentAnswer[]
): Promise<{ results: Record<string, unknown>[]; all_resolved: boolean }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/kb/align`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getKBStatus(
  projectId: string
): Promise<{ status: string; build: Record<string, unknown> | null }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/kb/status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Export ─────────────────────────────────────────────────────

export async function exportProject(projectId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/export`);
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
  const res = await fetch(`${API_BASE}/projects/${projectId}/history`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
