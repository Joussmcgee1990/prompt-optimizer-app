"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

function VideoUnmuteButton() {
  const [muted, setMuted] = useState(true);
  const toggle = () => {
    setMuted((m) => !m);
  };

  return (
    <>
      <button
        onClick={(e) => {
          const container = e.currentTarget.parentElement;
          const video = container?.querySelector("video");
          if (video) {
            video.muted = !video.muted;
            setMuted(video.muted);
          }
        }}
        className="absolute bottom-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors border border-white/10"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        )}
      </button>
    </>
  );
}

const features = [
  {
    step: "01",
    title: "Upload Documents",
    desc: "Drop your knowledge base files — markdown, text, or PDFs. We build a vector database automatically.",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    step: "02",
    title: "Define Evaluations",
    desc: "Set questions and required facts. Our AI judges whether your RAG prompt returns accurate answers.",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    step: "03",
    title: "Auto-Optimize",
    desc: "Claude analyzes failures and rewrites your prompt iteratively until it hits your target score.",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function LandingPage() {
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    setIsEmbedded(window.self !== window.top);
  }, []);

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
          {!isEmbedded && (
            <Link
              href="/projects"
              className="text-sm text-muted hover:text-white transition-colors"
            >
              My Projects
            </Link>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-24 md:pt-32 pb-12 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="font-[family-name:var(--font-markazi)] text-5xl md:text-7xl font-bold text-white leading-tight tracking-tight">
              Take Your Prompts
              <br />
              <span className="text-accent">Higher, Faster</span>
            </h1>
            <p className="mt-4 md:mt-6 text-base md:text-lg text-muted max-w-2xl mx-auto leading-relaxed">
              Stop guessing if your RAG prompts work. Upload your knowledge base,
              define what matters, and let AI auto-optimize your prompts to peak
              performance.
            </p>
          </motion.div>

          <motion.div
            className="mt-6 md:mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Link
              href="/projects"
              className="px-8 py-3.5 bg-white text-black font-semibold rounded-[10px] hover:bg-white/90 transition-all duration-300 text-sm tracking-wide"
            >
              Get Started
            </Link>
            <a
              href="#how-it-works"
              className="px-8 py-3.5 bg-transparent border border-border text-white font-medium rounded-[10px] hover:border-muted transition-all duration-300 text-sm tracking-wide"
            >
              How It Works
            </a>
          </motion.div>
        </div>
      </section>

      {/* Video Before/After */}
      <section className="py-12 md:py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-10"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-[family-name:var(--font-markazi)] text-4xl md:text-5xl font-bold text-white mb-3">
              Hone Your Prompts &amp; Skills
            </h2>
            <p className="text-muted text-base">
              Go from amateur to professional output
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            {/* Before */}
            <div className="flex flex-col items-center gap-3">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold tracking-wide">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                BEFORE
              </span>
              <div className="relative w-full max-w-[280px] aspect-[9/16] rounded-[20px] overflow-hidden border-2 border-red-500/20 bg-black group">
                <video
                  src="/videos/before.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
                <VideoUnmuteButton />
              </div>
            </div>

            {/* After */}
            <div className="flex flex-col items-center gap-3">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-semibold tracking-wide">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                AFTER
              </span>
              <div className="relative w-full max-w-[280px] aspect-[9/16] rounded-[20px] overflow-hidden border-2 border-green-500/20 bg-black group">
                <video
                  src="/videos/after.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
                <VideoUnmuteButton />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            className="font-[family-name:var(--font-markazi)] text-4xl font-bold text-white text-center mb-16"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Three Steps to Perfect Prompts
          </motion.h2>

          <motion.div
            className="grid md:grid-cols-3 gap-6"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            {features.map((f) => (
              <motion.div
                key={f.step}
                variants={item}
                className="bg-card rounded-[30px] p-8 border border-border hover:border-accent/30 transition-all duration-500 group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-500">
                    {f.icon}
                  </div>
                  <span className="text-xs font-bold text-accent tracking-widest">
                    STEP {f.step}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* What Will You Build? */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="font-[family-name:var(--font-markazi)] text-4xl font-bold text-white mb-3">
              What Will You Build?
            </h2>
            <p className="text-muted text-sm">
              Teams use prompt optimization for all kinds of AI skills
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            {[
              { emoji: "🎧", title: "Customer Support", desc: "Answer product questions, handle returns, and troubleshoot issues from your help docs" },
              { emoji: "📚", title: "Documentation Q&A", desc: "Help users find answers across your guides, tutorials, and API references" },
              { emoji: "⚖️", title: "Legal Review", desc: "Extract key clauses, summarize contracts, and flag risks from legal documents" },
              { emoji: "💰", title: "Sales Enablement", desc: "Arm your team with product specs, pricing details, and competitive intel" },
              { emoji: "🏢", title: "Internal Wiki", desc: "Search company policies, HR documents, and onboarding materials instantly" },
              { emoji: "🔧", title: "Technical Support", desc: "Debug issues using runbooks, architecture docs, and past incident reports" },
            ].map((ex) => (
              <motion.div
                key={ex.title}
                variants={item}
                className="bg-card rounded-2xl p-6 border border-border"
              >
                <span className="text-2xl mb-3 block">{ex.emoji}</span>
                <h3 className="text-sm font-semibold text-white mb-1">{ex.title}</h3>
                <p className="text-xs text-muted leading-relaxed">{ex.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <motion.div
          className="max-w-3xl mx-auto bg-card rounded-[30px] p-12 text-center border border-border"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
        >
          <h2 className="font-[family-name:var(--font-markazi)] text-3xl font-bold text-white mb-4">
            Ready to optimize?
          </h2>
          <p className="text-muted mb-8">
            Create your first project and start evaluating in minutes.
          </p>
          <Link
            href="/projects"
            className="inline-block px-10 py-4 bg-accent text-white font-semibold rounded-[10px] hover:bg-accent-hover transition-all duration-300 text-sm tracking-wide"
          >
            Create Project
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-xs text-muted">
            Built with Claude + Next.js + FastAPI
          </span>
          <span className="text-xs text-muted">
            Powered by VYZN
          </span>
        </div>
      </footer>
    </div>
  );
}
