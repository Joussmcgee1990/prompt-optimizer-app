"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export default function PromptEditor({
  value,
  onChange,
  disabled = false,
  label = "Prompt Template",
  description,
}: PromptEditorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wider">
            {label}
          </label>
          {description && (
            <p className="text-xs text-muted/60 mt-0.5">{description}</p>
          )}
        </div>
        <motion.button
          onClick={handleCopy}
          className="text-xs text-muted hover:text-accent transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-card-lighter"
          whileTap={{ scale: 0.95 }}
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </motion.button>
      </div>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={10}
          className="w-full bg-card border border-border rounded-[16px] px-5 py-4 text-sm text-white font-mono leading-relaxed placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors resize-y disabled:opacity-60"
          placeholder="Enter your prompt template here...&#10;&#10;Use {context} for retrieved context and {question} for the user's question."
        />
        <div className="absolute bottom-3 right-3 flex gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono">
            {"{context}"}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono">
            {"{question}"}
          </span>
        </div>
      </div>
    </div>
  );
}
