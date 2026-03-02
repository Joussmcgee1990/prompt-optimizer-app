const API_BASE = "http://localhost:8000/api";

// ── Types ──────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  prompt_template: string;
  kb_status: string;
  kb_doc_count: number;
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
  const data = await res.json();
  return data.projects;
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
  eventSource.addEventListener("error", (e) => {
    // SSE error event type doesn't have data - it's a connection error
    const messageEvent = e as MessageEvent;
    if (messageEvent.data) {
      try {
        const data = JSON.parse(messageEvent.data);
        onEvent(data);
      } catch {
        // ignore parse errors on error events
      }
    }
    eventSource.close();
    onError(new Error("SSE connection error"));
  });

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
  eventSource.addEventListener("iteration_complete", handleEvent);
  eventSource.addEventListener("optimizing", handleEvent);
  eventSource.addEventListener("complete", handleEvent);
  eventSource.addEventListener("max_retries", handleEvent);
  eventSource.addEventListener("error", (e) => {
    const messageEvent = e as MessageEvent;
    if (messageEvent.data) {
      try {
        const data = JSON.parse(messageEvent.data);
        onEvent(data);
      } catch {
        // ignore
      }
    }
    eventSource.close();
    onError(new Error("SSE connection error"));
  });

  return () => eventSource.close();
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
