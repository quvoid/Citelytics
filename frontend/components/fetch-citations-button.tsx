"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BACKEND_URL, DEMO_PROJECT_ID } from "@/lib/constants";
import type { FetchCitationsResponse } from "@/lib/types";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; data: FetchCitationsResponse }
  | { phase: "error"; message: string };

export function FetchCitationsButton() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const router = useRouter();

  async function handleFetch() {
    setState({ phase: "loading" });
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/fetch-citations/${DEMO_PROJECT_ID}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.detail || `Backend returned ${res.status} ${res.statusText}`
        );
      }
      const data: FetchCitationsResponse = await res.json();
      setState({ phase: "done", data });
      router.refresh();
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

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={handleFetch} disabled={state.phase === "loading"}>
        {state.phase === "loading" ? "Fetching citations…" : "Fetch citations now"}
      </Button>

      {state.phase === "error" && (
        <p className="max-w-md text-sm text-destructive">{state.message}</p>
      )}

      {state.phase === "done" && (
        <div className="flex max-w-xl flex-col gap-2 rounded-md border p-3 text-sm">
          <p className="font-medium">
            Processed {state.data.prompts_processed} prompt(s):
          </p>
          <ul className="flex flex-col gap-2">
            {state.data.statuses.map((s) => (
              <li key={s.prompt_id} className="flex flex-col gap-1">
                <span className="text-muted-foreground">{s.query_text}</span>
                <span className="flex flex-wrap gap-1.5">
                  {s.results.map((r) => (
                    <Badge
                      key={r.engine}
                      variant={
                        r.status === "success"
                          ? "default"
                          : r.status === "rate_limited"
                          ? "secondary"
                          : "destructive"
                      }
                      title={r.message ?? undefined}
                    >
                      {r.engine}:{" "}
                      {r.status === "success"
                        ? `${r.citation_count} citations`
                        : r.status}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
