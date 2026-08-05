"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/constants";
import { EngineLabel } from "@/components/engine-icons";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { FetchBatchStatusResponse, FetchTaskStatus } from "@/lib/types";

type State =
  | { phase: "idle" }
  | { phase: "polling"; tasks: FetchTaskStatus[]; promptText: Record<string, string> }
  | { phase: "done"; tasks: FetchTaskStatus[]; promptText: Record<string, string> }
  | { phase: "error"; message: string };

const POLL_INTERVAL_MS = 2000;

export function FetchCitationsButton({ projectId }: { projectId: string }) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const router = useRouter();
  const pollingRef = useRef(false);

  async function handleFetch() {
    setState({ phase: "polling", tasks: [], promptText: {} });
    try {
      const triggerRes = await fetch(`${BACKEND_URL}/api/projects/${projectId}/fetch`, {
        method: "POST",
      });
      if (!triggerRes.ok) {
        const body = await triggerRes.json().catch(() => ({}));
        throw new Error(body.detail || `Backend returned ${triggerRes.status} ${triggerRes.statusText}`);
      }
      const { batch_id } = (await triggerRes.json()) as { batch_id: string };

      const sb = createBrowserSupabaseClient();
      const { data: prompts } = await sb
        .from("prompts")
        .select("id, query_text")
        .eq("project_id", projectId);
      const promptText: Record<string, string> = Object.fromEntries(
        (prompts ?? []).map((p) => [p.id, p.query_text])
      );

      pollingRef.current = true;
      await pollUntilDone(batch_id, promptText);
    } catch (err) {
      setState({
        phase: "error",
        message:
          err instanceof Error
            ? err.message
            : "Could not reach the backend. Is uvicorn running on :8000?",
      });
    }
  }

  async function pollUntilDone(batchId: string, promptText: Record<string, string>) {
    while (pollingRef.current) {
      const res = await fetch(
        `${BACKEND_URL}/api/projects/${projectId}/fetch-status/${batchId}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Backend returned ${res.status} ${res.statusText}`);
      }
      const data: FetchBatchStatusResponse = await res.json();
      setState({ phase: data.done ? "done" : "polling", tasks: data.tasks, promptText });

      if (data.done) {
        pollingRef.current = false;
        router.refresh();
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  const isBusy = state.phase === "polling";

  return (
    <div className="relative">
      <button
        onClick={handleFetch}
        disabled={isBusy}
        className="whitespace-nowrap border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 font-sans text-xs tracking-[0.06em] text-[var(--cream)] uppercase hover:border-[var(--rust)] hover:bg-[var(--rust)] disabled:opacity-60"
      >
        {state.phase === "polling"
          ? "Fetching…"
          : state.phase === "done"
          ? "Fetched — run again"
          : "Fetch citations now"}
      </button>

      {(state.phase === "error" || state.phase === "polling" || state.phase === "done") && (
        <div className="absolute top-full right-0 z-30 mt-2 max-h-[70vh] w-[440px] overflow-y-auto border border-[var(--ink)] bg-[var(--paper)] p-4 text-left shadow-lg">
          {state.phase === "error" && (
            <p className="font-serif text-[15px] text-[var(--rust)]">{state.message}</p>
          )}
          {(state.phase === "polling" || state.phase === "done") && (
            <>
              <p className="font-serif text-[15px]">
                {state.phase === "polling" ? "Running…" : "Done"} —{" "}
                {state.tasks.filter((t) => t.status !== "pending").length}/{state.tasks.length} tasks
                complete
              </p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {Object.entries(
                  state.tasks.reduce<Record<string, FetchTaskStatus[]>>((acc, t) => {
                    (acc[t.prompt_id] ??= []).push(t);
                    return acc;
                  }, {})
                ).map(([promptId, tasks]) => (
                  <li key={promptId} className="border-t border-[var(--rule-light)] pt-2">
                    <div className="font-serif text-[14px] italic text-[var(--muted-2)]">
                      &ldquo;{state.promptText[promptId] ?? promptId}&rdquo;
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tracking-[0.04em] text-[var(--muted-2)] uppercase">
                      {tasks.map((t) => (
                        <span
                          key={t.engine_name}
                          title={t.message ?? undefined}
                          className="inline-flex items-center gap-1"
                        >
                          <EngineLabel name={t.engine_name} size={11} />:{" "}
                          <span
                            className={
                              t.status === "success"
                                ? "text-[var(--green)]"
                                : t.status === "pending"
                                ? "text-[var(--faint)]"
                                : "text-[var(--rust)]"
                            }
                          >
                            {t.status === "success" ? `${t.citation_count} citations` : t.status}
                          </span>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
