"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { EvalItem } from "@/lib/api";

interface EvalConfigProps {
  items: EvalItem[];
  onChange: (items: EvalItem[]) => void;
  disabled?: boolean;
}

export default function EvalConfig({ items, onChange, disabled = false }: EvalConfigProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    items.length > 0 ? 0 : null
  );

  const addItem = () => {
    const newItems = [
      ...items,
      { question: "", required_facts: ["", "", ""] },
    ];
    onChange(newItems);
    setExpandedIndex(newItems.length - 1);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
    if (expandedIndex === index) {
      setExpandedIndex(newItems.length > 0 ? Math.max(0, index - 1) : null);
    }
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

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-card rounded-[16px] border border-border overflow-hidden"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-card-lighter transition-colors"
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-1 rounded-md">
                  Q{i + 1}
                </span>
                <span className="text-sm text-white truncate max-w-md">
                  {item.question || "New question..."}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">
                  {item.required_facts.filter((f) => f.trim()).length} facts
                </span>
                {!disabled && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(i);
                    }}
                    className="text-muted hover:text-error transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <svg
                  className={`w-4 h-4 text-muted transition-transform ${
                    expandedIndex === i ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Expanded content */}
            <AnimatePresence>
              {expandedIndex === i && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
                    {/* Question input */}
                    <div>
                      <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1.5 block">
                        Question
                      </label>
                      <input
                        type="text"
                        value={item.question}
                        onChange={(e) => updateQuestion(i, e.target.value)}
                        disabled={disabled}
                        placeholder="e.g. What services does the company offer?"
                        className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
                      />
                    </div>

                    {/* Required facts */}
                    <div>
                      <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1.5 block">
                        Required Facts
                      </label>
                      <div className="space-y-2">
                        {item.required_facts.map((fact, fi) => (
                          <div key={fi} className="flex items-center gap-2">
                            <span className="text-xs text-muted w-4 text-right shrink-0">
                              {fi + 1}.
                            </span>
                            <input
                              type="text"
                              value={fact}
                              onChange={(e) => updateFact(i, fi, e.target.value)}
                              disabled={disabled}
                              placeholder={`Required fact ${fi + 1}`}
                              className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
                            />
                            {!disabled && item.required_facts.length > 1 && (
                              <button
                                onClick={() => removeFact(i, fi)}
                                className="text-muted hover:text-error transition-colors p-1 shrink-0"
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
                          className="mt-2 text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        ))}
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
