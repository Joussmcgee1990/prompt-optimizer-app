"use client";

import { useParams, redirect } from "next/navigation";

export default function ProjectPage() {
  const params = useParams();
  redirect(`/projects/${params.id}/setup`);
}
