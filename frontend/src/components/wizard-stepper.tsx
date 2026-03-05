"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const steps = [
  { label: "Setup", path: "setup", icon: "01" },
  { label: "Knowledge", path: "knowledge-base", icon: "02" },
  { label: "Optimize", path: "optimize", icon: "03" },
];

export default function WizardStepper({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const currentStep = steps.findIndex((s) => pathname.includes(s.path));

  return (
    <div className="w-full mb-10">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {steps.map((step, i) => {
          const isActive = i === currentStep;
          const isComplete = i < currentStep;
          const href = `/projects/${projectId}/${step.path}`;

          return (
            <div key={step.path} className="flex items-center flex-1 last:flex-none">
              <Link href={href} className="flex flex-col items-center gap-2 group">
                <motion.div
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold
                    transition-all duration-300 border-2
                    ${isActive
                      ? "bg-accent border-accent text-white"
                      : isComplete
                        ? "bg-accent/20 border-accent text-accent"
                        : "bg-card border-border text-muted group-hover:border-muted"
                    }
                  `}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isComplete ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.icon
                  )}
                </motion.div>
                <span
                  className={`text-xs font-medium tracking-wider uppercase ${
                    isActive ? "text-white" : isComplete ? "text-accent" : "text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </Link>

              {i < steps.length - 1 && (
                <div className="flex-1 mx-4 mt-[-1.5rem]">
                  <div className="h-[2px] bg-border relative">
                    {isComplete && (
                      <motion.div
                        className="absolute inset-0 bg-accent"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: 0.5 }}
                        style={{ transformOrigin: "left" }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
