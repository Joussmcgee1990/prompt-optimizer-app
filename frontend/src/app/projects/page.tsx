"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listProjects, createProject, type Project } from "@/lib/api";

// ─── Pre-built project templates ───────────────────────────────────────────

const TEMPLATES = [
  {
    id: "scratch" as const,
    emoji: "📝",
    title: "Start from Scratch",
    subtitle: "Custom project",
    description: "Build your own prompt from the ground up with full control over every detail.",
    defaultName: "",
    defaultDesc: "",
    promptTemplate: null,
  },
  {
    id: "ic-note" as const,
    emoji: "📋",
    title: "IC Note Writer",
    subtitle: "VC IC note generator",
    description: "Build a skill that takes deep research on a company and writes a standardised Investment Committee note.",
    defaultName: "IC Note Writer",
    defaultDesc: "VC analyst IC note generation skill — analyses companies against a best-in-class IC note format and produces standardised investment committee notes.",
    promptTemplate: `You are an expert venture capital analyst specialising in writing Investment Committee (IC) notes. Your task is to analyse a company using the provided knowledge base (built from deep research) and produce a comprehensive, standardised IC note.

## Instructions

Using the research context provided, write a thorough IC note that follows the standardised format below. Be data-driven, precise, and objective. Where data is unavailable, explicitly note the gap rather than speculating.

## IC Note Format

Your IC note MUST include the following sections in order:

### 1. Company Overview
- Company name, founding date, HQ location, stage, sector
- One-paragraph executive summary of the business
- Key metrics snapshot (ARR/revenue, growth rate, headcount, funding to date)

### 2. Market Opportunity
- Total Addressable Market (TAM) with sources
- Market dynamics, growth drivers, and tailwinds
- Timing thesis — why now?

### 3. Product & Technology
- Core product description and value proposition
- Technical differentiation / moat
- Product roadmap and expansion opportunities
- Current customers and use cases

### 4. Team Assessment
- Founders' backgrounds and relevant experience
- Key hires and team composition
- Founder-market fit analysis
- Board composition and key advisors

### 5. Business Model & Traction
- Revenue model (SaaS, usage-based, marketplace, etc.)
- Unit economics (CAC, LTV, payback period, margins)
- Growth trajectory with key milestones
- Pipeline and expansion revenue signals

### 6. Competitive Landscape
- Direct and indirect competitors
- Competitive positioning matrix
- Sustainable advantages / defensibility

### 7. Key Risks
- Enumerate the top 5 risks (market, execution, technical, regulatory, competitive)
- For each risk, assess severity and provide any mitigants

### 8. Investment Thesis
- Bull case (3 key reasons to invest)
- Bear case (3 key reasons to pass)
- What needs to be true for this to be a great investment?

### 9. Terms & Valuation
- Current round details (if available): valuation, instrument, amount raising
- Cap table considerations
- Comparable company valuations and benchmarks

### 10. Recommendation
- Clear recommendation: Strong Yes / Yes / More Diligence / Pass
- One-paragraph synthesis justifying the recommendation
- Key next steps if progressing

## Context from Knowledge Base

{context}

## Question

{question}`,
  },
  {
    id: "ai-engineer" as const,
    emoji: "🤖",
    title: "AI Engineer Eval",
    subtitle: "Candidate evaluation reports",
    description: "Build a skill that takes a CV and interview notes, scores candidates on a weighted rubric, and writes a standardised evaluation report.",
    defaultName: "AI Engineer Eval",
    defaultDesc: "Candidate evaluation skill — parses CVs and call notes through a structured rubric for AI engineers and produces standardised evaluation reports with dimension scores and recommendations.",
    promptTemplate: `You are a technical hiring evaluator for an AI Engineer role at Studio 137 / IZZA Fellowship. Your task is to evaluate candidates by analysing their CV and any interview/screening call notes against a structured rubric, then produce a comprehensive evaluation report.

## Instructions

Analyse the candidate materials provided in the knowledge base and produce a standardised evaluation report following the exact format below. Be evidence-based — every score must be justified with specific examples from the CV or call notes.

## Evaluation Rubric — 7 Dimensions

Score each dimension from 0–10 based on the evidence available:

| # | Dimension | Weight | What to Look For |
|---|-----------|--------|------------------|
| 1 | **Technical Engineering Capability** | 30% | Production systems, languages (Python, TypeScript), infrastructure, databases, CI/CD, system design depth |
| 2 | **AI/ML/LLM Tooling Fluency** | 20% | LLM APIs, prompt engineering, RAG pipelines, vector DBs, fine-tuning, agent frameworks, embeddings |
| 3 | **Builder / Shipping Track Record** | 20% | Products launched, side projects shipped, pace of delivery, ability to go from 0→1 |
| 4 | **System Architecture & Data Thinking** | 10% | Data modelling, pipeline design, scalability thinking, trade-off analysis |
| 5 | **Entrepreneurial Curiosity** | 10% | Side projects, startup experience, self-directed learning, intellectual curiosity signals |
| 6 | **Communication & Collaboration** | 5% | Written clarity, verbal articulation (if call notes available), team collaboration evidence |
| 7 | **Mission / Domain Fit** | 5% | Alignment with hospitality-tech, WhatsApp/conversational AI, interest in the IZZA mission |

## Scoring Guide
- **9–10**: Exceptional, top 5% of candidates
- **7–8**: Strong, clearly above bar
- **5–6**: Meets minimum bar
- **3–4**: Below bar, notable gaps
- **0–2**: Significant deficiency

## Report Format

Your evaluation report MUST include the following sections in order:

### 1. Relevance Map
A table mapping key evidence from the CV/call to the role requirements:
| Candidate Evidence | IZZA / Role Match | Significance |
Each row should tag significance as **High**, **Medium**, or **Note gap**.

### 2. Dimension Scores
For each of the 7 dimensions, provide:
- **Score**: X/10
- **Weight**: X%
- **Weighted Score**: (Score × Weight × 10)
- **Evidence**: 2–4 sentences citing specific CV/call evidence

Calculate the **CV Sub-Total** as the sum of all weighted scores (max 100).

### 3. Call Evaluation (if call notes provided)
If screening/interview call notes are available:
- Evaluate these signals: Communication Clarity, Technical Reasoning Quality, Energy/Enthusiasm, Cultural Fit Indicators, Red Flags/Contradictions
- Rate each as High / Medium-High / Medium / Low
- Provide a **Call Sub-Score** out of 100

### 4. Composite Score
- If call notes available: **Composite = (CV Sub-Total × 60%) + (Call Sub-Score × 40%)**
- If CV only: **Composite = CV Sub-Total**

### 5. Grade Tier
Based on composite score:
- **Strong Yes**: ≥ 85
- **Yes**: ≥ 70
- **Borderline**: ≥ 55
- **No**: ≥ 40
- **Strong No**: < 40

### 6. Narrative Evaluation
Four paragraphs (max 4 sentences each):
1. **Technical Capability** — depth and breadth of engineering skills
2. **Builder / Entrepreneurial Evidence** — shipping track record and initiative
3. **Shipping Track Record** — velocity, quality, and scope of delivered work
4. **Concerns / Gaps** — areas of weakness or missing evidence

### 7. Recommendation
- **Progress** (score ≥ 70), **Progress with Caveat** (score ≥ 55), or **Do Not Progress** (score < 55)
- One-sentence summary justifying the recommendation

### 8. Exception Flag (if applicable)
If score is below 70 but candidate shows exceptional builder signals that the rubric may underweight, flag for human review with:
- Triggering signals
- Justification for exception consideration

## Context from Knowledge Base

{context}

## Question

{question}`,
  },
];

type TemplateId = typeof TEMPLATES[number]["id"];

// ─── Component ─────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [modalStep, setModalStep] = useState<"choose" | "details">("choose");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    const embedded = window.self !== window.top;
    setIsEmbedded(embedded);
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setModalStep("choose");
    setSelectedTemplate(null);
    setNewName("");
    setNewDesc("");
    setShowCreate(true);
  }

  function selectTemplate(templateId: TemplateId) {
    const tmpl = TEMPLATES.find((t) => t.id === templateId)!;
    setSelectedTemplate(templateId);
    setNewName(tmpl.defaultName);
    setNewDesc(tmpl.defaultDesc);
    setModalStep("details");
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const tmpl = TEMPLATES.find((t) => t.id === selectedTemplate);
      const project = await createProject({
        name: newName.trim(),
        description: newDesc.trim(),
        ...(tmpl?.promptTemplate ? { prompt_template: tmpl.promptTemplate } : {}),
      });
      router.push(`/projects/${project.id}/setup`);
    } catch (err) {
      console.error("Failed to create project:", err);
      setCreating(false);
    }
  }

  function getStatusColor(status: string) {
    if (status === "ready") return "bg-success";
    if (status === "loading") return "bg-warning";
    return "bg-muted";
  }

  const templateCards = TEMPLATES.map((tmpl) => (
    <motion.button
      key={tmpl.id}
      onClick={() => selectTemplate(tmpl.id)}
      className={`text-left bg-background rounded-2xl p-5 border-2 transition-all duration-300 group hover:border-accent/50 ${
        tmpl.id === "scratch"
          ? "border-border hover:bg-background"
          : "border-border hover:bg-accent/5"
      }`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <span className="text-3xl mb-3 block">{tmpl.emoji}</span>
      <h3 className="text-sm font-semibold text-white mb-0.5 group-hover:text-accent transition-colors">
        {tmpl.title}
      </h3>
      <p className="text-xs text-accent/60 font-medium mb-2">{tmpl.subtitle}</p>
      <p className="text-xs text-muted leading-relaxed">{tmpl.description}</p>
    </motion.button>
  ));

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-semibold text-white tracking-wide">
              Prompt Builder &amp; Optimizer
            </span>
          </Link>
        </div>
      </nav>

      <div className="pt-24 pb-12 px-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-sm text-muted mt-1">
              Each project has its own knowledge base, evaluations, and optimized prompts.
            </p>
          </div>
          <motion.button
            onClick={openCreate}
            className="px-5 py-2.5 bg-white text-black font-semibold rounded-[10px] hover:bg-white/90 transition-all text-sm"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            + New Project
          </motion.button>
        </div>

        {/* Create Modal */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !creating && setShowCreate(false)}
            >
              <motion.div
                className={`bg-card rounded-[20px] border border-border ${
                  modalStep === "choose" ? "p-8 w-full max-w-2xl" : "p-8 w-full max-w-md"
                }`}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                layout
              >
                <AnimatePresence mode="wait">
                  {modalStep === "choose" ? (
                    <motion.div
                      key="choose"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <h2 className="text-lg font-semibold text-white mb-1">
                        Create New Project
                      </h2>
                      <p className="text-sm text-muted mb-6">
                        Start from scratch or use a pre-built template
                      </p>

                      <div className="grid grid-cols-3 gap-4">
                        {templateCards}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="details"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                    >
                      {/* Back button + title */}
                      <div className="flex items-center gap-3 mb-5">
                        <button
                          onClick={() => setModalStep("choose")}
                          className="text-muted hover:text-white transition-colors p-1 -ml-1"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <div>
                          <h2 className="text-lg font-semibold text-white">
                            {selectedTemplate === "scratch"
                              ? "New Project"
                              : `Create: ${TEMPLATES.find((t) => t.id === selectedTemplate)?.title}`}
                          </h2>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">
                            Project Name
                          </label>
                          <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="e.g. My Company Bot"
                            className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">
                            Description (optional)
                          </label>
                          <textarea
                            value={newDesc}
                            onChange={(e) => setNewDesc(e.target.value)}
                            placeholder="Brief description of what this project is about..."
                            rows={3}
                            className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors resize-none"
                          />
                        </div>

                        {/* Template badge */}
                        {selectedTemplate && selectedTemplate !== "scratch" && (
                          <div className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-xl px-4 py-3">
                            <svg className="w-4 h-4 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                              <p className="text-xs font-medium text-accent">Pre-configured prompt template</p>
                              <p className="text-xs text-muted mt-0.5">
                                {selectedTemplate === "ic-note"
                                  ? "Tailored for VC IC note generation with 10-section standardised format"
                                  : "Structured rubric with 7 weighted dimensions and composite scoring"}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            onClick={() => setShowCreate(false)}
                            disabled={creating}
                            className="px-4 py-2 text-sm text-muted hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleCreate}
                            disabled={!newName.trim() || creating}
                            className="px-6 py-2 bg-accent text-white font-medium rounded-[10px] hover:bg-accent-hover transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {creating ? "Creating..." : "Create Project"}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Projects Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            className="text-center py-12 md:py-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="w-16 h-16 rounded-full bg-card mx-auto flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-muted mb-2">No projects yet</p>
            <p className="text-xs text-muted/60 mb-6">
              Get started with a template or build your own from scratch
            </p>

            <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
              {TEMPLATES.map((tmpl) => (
                <motion.button
                  key={tmpl.id}
                  onClick={() => {
                    selectTemplate(tmpl.id);
                    setShowCreate(true);
                  }}
                  className="text-left bg-card rounded-2xl p-5 border-2 border-border hover:border-accent/50 transition-all duration-300 group"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="text-3xl mb-3 block">{tmpl.emoji}</span>
                  <h3 className="text-sm font-semibold text-white mb-0.5 group-hover:text-accent transition-colors">
                    {tmpl.title}
                  </h3>
                  <p className="text-xs text-accent/60 font-medium mb-2">{tmpl.subtitle}</p>
                  <p className="text-xs text-muted leading-relaxed">{tmpl.description}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {projects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/projects/${project.id}/setup`}
                  className="block bg-card rounded-[20px] p-6 border border-border hover:border-accent/30 transition-all duration-300 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-white group-hover:text-accent transition-colors">
                      {project.name}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(project.kb_status)}`} />
                      <span className="text-xs text-muted capitalize">
                        {project.kb_status}
                      </span>
                    </div>
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted mb-3 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>{project.kb_doc_count} docs</span>
                    <span>
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
