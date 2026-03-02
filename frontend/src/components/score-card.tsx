"use client";

import { motion } from "framer-motion";

interface ScoreCardProps {
  score: number;
  label?: string;
  size?: "sm" | "md" | "lg";
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return "text-success";
  if (score >= 0.5) return "text-warning";
  return "text-error";
}

function getScoreBg(score: number): string {
  if (score >= 0.8) return "bg-success/10 border-success/20";
  if (score >= 0.5) return "bg-warning/10 border-warning/20";
  return "bg-error/10 border-error/20";
}

export default function ScoreCard({
  score,
  label = "Score",
  size = "md",
}: ScoreCardProps) {
  const pct = Math.round(score * 100);
  const sizeClasses = {
    sm: "w-20 h-20 text-2xl",
    md: "w-28 h-28 text-4xl",
    lg: "w-36 h-36 text-5xl",
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        className={`${sizeClasses[size]} ${getScoreBg(score)} rounded-full flex items-center justify-center border-2 relative`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        {/* Circular progress ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-border"
          />
          <motion.circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className={getScoreColor(score)}
            strokeDasharray={`${pct * 2.83} 283`}
            initial={{ strokeDasharray: "0 283" }}
            animate={{ strokeDasharray: `${pct * 2.83} 283` }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
          />
        </svg>
        <motion.span
          className={`font-bold ${getScoreColor(score)} relative z-10`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {pct}%
        </motion.span>
      </motion.div>
      <span className="text-xs font-medium text-muted uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

export function ScoreBar({ score, label }: { score: number; label: string }) {
  const pct = Math.round(score * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-white">{label}</span>
        <span className={`font-semibold ${getScoreColor(score)}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-card-lighter rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${
            score >= 0.8 ? "bg-success" : score >= 0.5 ? "bg-warning" : "bg-error"
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
