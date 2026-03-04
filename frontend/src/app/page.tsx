"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

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
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="font-[family-name:var(--font-markazi)] text-6xl md:text-7xl font-bold text-white leading-tight tracking-tight">
              Take Your Prompts
              <br />
              <span className="text-accent">Higher, Faster</span>
            </h1>
            <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
              Stop guessing if your RAG prompts work. Upload your knowledge base,
              define what matters, and let AI auto-optimize your prompts to peak
              performance.
            </p>
          </motion.div>

          <motion.div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
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
