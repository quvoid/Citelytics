"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary } from "@/lib/button-styles";
import { BACKEND_URL } from "@/lib/constants";
import type { PerceptionFetchResponse } from "@/lib/types";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; processed: number; skipped: number; message: string | null }
  | { phase: "error"; message: string };

export function FetchPerceptionButton({ projectId }: { projectId: string }) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const router = useRouter();

  async function handleFetch() {
    setState({ phase: "loading" });
    try {
      const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/fetch-perception`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Backend returned ${res.status} ${res.statusText}`);
      }
      const data: PerceptionFetchResponse = await res.json();
      setState({
        phase: "done",
        processed: data.processed,
        skipped: data.skipped?.length ?? 0,
        message: data.message,
      });
      router.refresh();
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Could not reach the backend.",
      });
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleFetch}
        disabled={state.phase === "loading"}
        className={buttonPrimary}
      >
        {state.phase === "loading" ? "Fetching…" : "Fetch perception now"}
      </button>
      {state.phase === "done" && (
        <span
          className="font-serif text-[13px] italic"
          style={{ color: state.processed === 0 && state.skipped > 0 ? "var(--rust)" : "var(--muted-2)" }}
          title={state.message ?? undefined}
        >
          {state.processed} answer(s) processed
          {state.skipped > 0 ? `, ${state.skipped} skipped` : ""}
        </span>
      )}
      {state.phase === "error" && (
        <span className="font-serif text-[13px] text-[var(--rust)] italic">{state.message}</span>
      )}
    </div>
  );
}
