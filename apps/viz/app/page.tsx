"use client";

import { useEffect } from "react";
import { useBrain } from "@/lib/store";
import { api } from "@/lib/api";
import Shell from "@/components/Shell";

export default function Page() {
  const load = useBrain((s) => s.load);
  const refresh = useBrain((s) => s.refresh);

  useEffect(() => { load(); }, [load]);

  // Live updates: the server watches the cells directory and pushes on change,
  // so editing a cell in your editor redraws the graph without a reload.
  useEffect(() => api.subscribe(refresh), [refresh]);

  return <Shell />;
}
