"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/constants";

type State = { phase: "idle" } | { phase: "loading" } | { phase: "error"; message: string };

export function AnalyseBriefButton({ briefId }: { briefId: string }) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const router = useRouter();

  async function handleAnalyse() {
    setState({ phase: "loading" });
    try {
      const res = await fetch(`${BACKEND_URL}/api/content-briefs/${briefId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Backend returned ${res.status} ${res.statusText}`);
      }
      router.refresh();
      setState({ phase: "idle" });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Could not reach the backend.",
      });
    }
  }

  return (
    <div>
      <button
        onClick={handleAnalyse}
        disabled={state.phase === "loading"}
        className="border border-[var(--rust)] bg-[var(--rust)] px-6 py-3 font-sans text-xs tracking-[0.06em] text-[var(--paper)] uppercase disabled:opacity-60"
      >
        {state.phase === "loading" ? "Analysing…" : "Analyse prompt"}
      </button>
      {state.phase === "error" && (
        <p className="mt-3 max-w-[47ch] font-serif text-[14px] text-[var(--rust)] italic">
          {state.message}
        </p>
      )}
    </div>
  );
}
