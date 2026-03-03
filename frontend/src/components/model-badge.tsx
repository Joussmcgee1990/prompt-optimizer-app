"use client";

/**
 * Inline badge showing which AI model powers a given feature.
 *
 * Usage:
 *   <ModelBadge model="sonnet" />   → "Sonnet 4.6"
 *   <ModelBadge model="opus" />     → "Opus 4.6"
 *   <ModelBadge model="gemini" />   → "Gemini 2.5 Pro"
 */
export default function ModelBadge({
  model,
}: {
  model: "sonnet" | "opus" | "gemini";
}) {
  const config = {
    opus: {
      label: "Opus 4.6",
      color: "text-amber-400/80 border-amber-400/20 bg-amber-400/5",
      title: "Powered by Claude Opus 4.6",
    },
    sonnet: {
      label: "Sonnet 4.6",
      color: "text-blue-400/80 border-blue-400/20 bg-blue-400/5",
      title: "Powered by Claude Sonnet 4.6",
    },
    gemini: {
      label: "Gemini 2.5 Pro",
      color: "text-emerald-400/80 border-emerald-400/20 bg-emerald-400/5",
      title: "Powered by Gemini 2.5 Pro (Deep Research)",
    },
  }[model];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${config.color}`}
      title={config.title}
    >
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
      </svg>
      {config.label}
    </span>
  );
}
