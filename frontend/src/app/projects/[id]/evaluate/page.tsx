"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * Redirect: the evaluate step has been merged into the optimize page.
 * This redirect preserves backwards compatibility for bookmarks/links.
 */
export default function EvaluateRedirect() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  useEffect(() => {
    router.replace(`/projects/${projectId}/optimize`);
  }, [projectId, router]);

  return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
