"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface TerminalLine {
  id: string;
  text: string;
  type: "info" | "success" | "error" | "header" | "progress" | "dim";
  timestamp?: string;
}

interface TerminalOutputProps {
  lines: TerminalLine[];
  title?: string;
  maxHeight?: string;
}

const typeColors: Record<TerminalLine["type"], string> = {
  info: "text-blue-400",
  success: "text-emerald-400",
  error: "text-red-400",
  header: "text-white font-semibold",
  progress: "text-amber-400",
  dim: "text-zinc-500",
};

const typePrefix: Record<TerminalLine["type"], string> = {
  info: "→",
  success: "✓",
  error: "✗",
  header: "▸",
  progress: "⟳",
  dim: " ",
};

export default function TerminalOutput({
  lines,
  title = "Build Output",
  maxHeight = "420px",
}: TerminalOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="bg-[#0d0d0d] rounded-[16px] border border-zinc-800 overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900/50 border-b border-zinc-800">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <div className="w-3 h-3 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs text-zinc-500 ml-2 font-mono">{title}</span>
      </div>

      {/* Output */}
      <div
        ref={scrollRef}
        className="p-4 overflow-y-auto font-mono text-[13px] leading-relaxed"
        style={{ maxHeight }}
      >
        <AnimatePresence mode="popLayout">
          {lines.map((line) => (
            <motion.div
              key={line.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={`${typeColors[line.type]} flex gap-2`}
            >
              <span className="shrink-0 w-4 text-center opacity-60">
                {typePrefix[line.type]}
              </span>
              <span className="whitespace-pre-wrap">{line.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Blinking cursor */}
        {lines.length > 0 && (
          <div className="flex gap-2 mt-1">
            <span className="w-4" />
            <span className="w-2 h-4 bg-zinc-500 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
