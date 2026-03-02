"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import WizardStepper from "@/components/wizard-stepper";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const projectId = params.id as string;

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
              Prompt Optimizer
            </span>
          </Link>
          <Link
            href="/projects"
            className="text-sm text-muted hover:text-white transition-colors"
          >
            All Projects
          </Link>
        </div>
      </nav>

      <div className="pt-24 pb-12 px-6 max-w-4xl mx-auto">
        <WizardStepper projectId={projectId} />
        {children}
      </div>
    </div>
  );
}
