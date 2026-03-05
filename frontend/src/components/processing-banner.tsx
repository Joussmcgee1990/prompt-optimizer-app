"use client";

import { motion } from "framer-motion";

interface ProcessingBannerProps {
  /** Main status message, e.g. "Building Knowledge Base..." */
  message: string;
  /** Optional sub-message with details */
  detail?: string;
  /** Visual variant */
  variant?: "default" | "indexing" | "saving" | "generating";
  /** Whether to show a pulsing progress bar (indeterminate) */
  showProgress?: boolean;
}

const variantConfig = {
  default: {
    bg: "bg-accent/10",
    border: "border-accent/20",
    iconColor: "text-accent",
    barColor: "bg-accent",
    dotColor: "bg-accent",
  },
  indexing: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    iconColor: "text-amber-400",
    barColor: "bg-amber-400",
    dotColor: "bg-amber-400",
  },
  saving: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    iconColor: "text-blue-400",
    barColor: "bg-blue-400",
    dotColor: "bg-blue-400",
  },
  generating: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    iconColor: "text-purple-400",
    barColor: "bg-purple-400",
    dotColor: "bg-purple-400",
  },
};

export default function ProcessingBanner({
  message,
  detail,
  variant = "default",
  showProgress = true,
}: ProcessingBannerProps) {
  const cfg = variantConfig[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -10, height: 0 }}
      transition={{ duration: 0.3 }}
      className={`${cfg.bg} border ${cfg.border} rounded-[16px] p-5 overflow-hidden`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        {/* Animated icon */}
        <div className="relative shrink-0">
          <div
            className={`w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center`}
          >
            <svg
              className={`w-5 h-5 ${cfg.iconColor} animate-spin`}
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          {/* Pulsing ring */}
          <div
            className={`absolute inset-0 rounded-full ${cfg.border} border-2 animate-ping opacity-30`}
          />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{message}</p>
          {detail && (
            <p className="text-xs text-muted mt-0.5 truncate">{detail}</p>
          )}
        </div>

        {/* Animated dots */}
        <div className="flex items-center gap-1 shrink-0">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`}
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
      </div>

      {/* Progress bar (indeterminate) */}
      {showProgress && (
        <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${cfg.barColor} rounded-full`}
            animate={{
              x: ["-100%", "100%"],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ width: "40%" }}
          />
        </div>
      )}
    </motion.div>
  );
}
