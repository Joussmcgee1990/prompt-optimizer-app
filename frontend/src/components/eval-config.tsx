"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { EvalItem } from "@/lib/api";

interface EvalConfigProps {
  items: EvalItem[];
  onChange: (items: EvalItem[]) => void;
  disabled?: boolean;
}

export default function EvalConfig({ items, onChange, disabled = false }: EvalConfigProps) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(
    () => new Set(items.length > 0 ? [0] : [])
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-resize all textareas when items change (e.g., after auto-generate)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.querySelectorAll("textarea").forEach((ta) => {
        ta.style.height = "auto";
        ta.style.height = ta.scrollHeight + "px";
      });
    }
  }, [items]);

  const toggleExpanded = (index: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSet(new Set(items.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedSet(new Set());
  };

  const addItem = () => {
    const newItems = [
      ...items,
      { question: "", required_facts: ["", "", ""] },
    ];
    onChange(newItems);
    setExpandedSet((prev) => new Set([...prev, newItems.length - 1]));
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
    setExpandedSet((prev) => {
      const next = new Set(
        [...prev]
          .filter((idx) => idx !== index)
          .map((idx) => (idx > index ? idx - 1 : idx))
      );
      return next;
    });
  };

  const updateQuestion = (index: number, question: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], question };
    onChange(newItems);
  };

  const updateFact = (itemIndex: number, factIndex: number, value: string) => {
    const newItems = [...items];
    const facts = [...newItems[itemIndex].required_facts];
    facts[factIndex] = value;
    newItems[itemIndex] = { ...newItems[itemIndex], required_facts: facts };
    onChange(newItems);
  };

  const addFact = (itemIndex: number) => {
    const newItems = [...items];
    newItems[itemIndex] = {
      ...newItems[itemIndex],
      required_facts: [...newItems[itemIndex].required_facts, ""],
    };
    onChange(newItems);
  };

  const removeFact = (itemIndex: number, factIndex: number) => {
    const newItems = [...items];
    const facts = newItems[itemIndex].required_facts.filter(
      (_, i) => i !== factIndex
    );
    newItems[itemIndex] = { ...newItems[itemIndex], required_facts: facts };
    onChange(newItems);
  };

  const handleTextareaResize = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = "auto";
    target.style.height = target.scrollHeight + "px";
  };

  return (
    <div className="space-y-3" ref={containerRef}>
      {/* Expand/Collapse all controls */}
      {items.length > 1 && (
        <div className="flex items-center justify-end gap-2 mb-1">
          <button
            onClick={expandAll}
            className="text-xs text-muted hover:text-accent transition-colors"
          >
            Expand all
          </button>
          <span className="text-xs text-border">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-muted hover:text-accent transition-colors"
          >
            Collapse all
          </button>
        </div>
      )}

      <AnimatePresence>
        {items.map((item, i) => {
          const isExpanded = expandedSet.has(i);
          const filledFacts = item.required_facts.filter((f) => f.trim());

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`bg-card rounded-[16px] border transition-colors ${
                isExpanded ? "border-accent/30" : "border-border"
              }`}
            >
              {/* Header - always visible */}
              <div
                className="flex items-start justify-between px-5 py-4 cursor-pointer hover:bg-card-lighter transition-colors rounded-[16px]"
                onClick={() => toggleExpanded(i)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-md shrink-0">
                      Q{i + 1}
                    </span>
                    <svg
                      className={`w-4 h-4 text-muted transition-transform shrink-0 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* Question preview - full text visible in collapsed state */}
                  <p className={`text-sm text-white leading-relaxed ${isExpanded ? "hidden" : "mt-1"}`}>
                    {item.question || (
                      <span className="text-muted/50 italic">No question set...</span>
                    )}
                  </p>

                  {/* Facts summary in collapsed state */}
                  {!isExpanded && filledFacts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {filledFacts.map((fact, fi) => (
                        <span
                          key={fi}
                          className="inline-block text-xs text-muted bg-background px-2.5 py-1 rounded-md max-w-full"
                        >
                          <span className="text-accent/60 mr-1">#{fi + 1}</span>
                          <span className="line-clamp-1">{fact}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {!isExpanded && filledFacts.length === 0 && item.question && (
                    <span className="text-xs text-muted/50 mt-1 block italic">No facts defined</span>
                  )}
                </div>

                {/* Delete button */}
                <div className="flex items-center gap-2 shrink-0 ml-3 mt-1">
                  {!disabled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(i);
                      }}
                      className="text-muted hover:text-error transition-colors p-1"
                      title="Remove question"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded content - editing mode */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
                      {/* Question input */}
                      <div>
                        <label className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Question
                        </label>
                        <textarea
                          value={item.question}
                          onChange={(e) => updateQuestion(i, e.target.value)}
                          onInput={handleTextareaResize}
                          disabled={disabled}
                          placeholder="e.g. What services does the company offer?"
                          rows={2}
                          className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all disabled:opacity-50 resize-none overflow-hidden leading-relaxed"
                        />
                      </div>

                      {/* Required facts */}
                      <div>
                        <label className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Required Facts
                          <span className="text-muted/50 font-normal normal-case tracking-normal">
                            — facts the answer must include
                          </span>
                        </label>
                        <div className="space-y-2">
                          {item.required_facts.map((fact, fi) => (
                            <div key={fi} className="flex items-start gap-2 group">
                              <span className="text-xs font-medium text-accent/60 w-5 text-right shrink-0 mt-3">
                                {fi + 1}.
                              </span>
                              <textarea
                                value={fact}
                                onChange={(e) => updateFact(i, fi, e.target.value)}
                                onInput={handleTextareaResize}
                                disabled={disabled}
                                placeholder={`Required fact ${fi + 1}`}
                                rows={1}
                                className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all disabled:opacity-50 resize-none overflow-hidden leading-relaxed"
                              />
                              {!disabled && item.required_facts.length > 1 && (
                                <button
                                  onClick={() => removeFact(i, fi)}
                                  className="text-muted/30 hover:text-error transition-colors p-1 shrink-0 mt-1.5 opacity-0 group-hover:opacity-100"
                                  title="Remove fact"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {!disabled && (
                          <button
                            onClick={() => addFact(i)}
                            className="mt-2.5 text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1.5 px-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add fact
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {!disabled && (
        <motion.button
          onClick={addItem}
          className="w-full py-3 rounded-[16px] border-2 border-dashed border-border hover:border-accent text-muted hover:text-accent text-sm font-medium transition-all duration-300"
          whileHover={{ scale: 1.005 }}
          whileTap={{ scale: 0.995 }}
        >
          + Add Evaluation Question
        </motion.button>
      )}
    </div>
  );
}
