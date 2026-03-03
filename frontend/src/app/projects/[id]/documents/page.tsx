"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DocumentsRedirect() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  useEffect(() => {
    router.replace(`/projects/${projectId}/knowledge-base`);
  }, [router, projectId]);

  return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
