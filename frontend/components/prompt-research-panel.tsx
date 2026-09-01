"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/constants";
import { addPrompt } from "@/lib/actions/prompts";
import { COUNTRIES, countryName } from "@/lib/countries";
import type { PromptCandidate, PromptResearchResponse } from "@/lib/types";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; candidates: PromptCandidate[] }
  | { phase: "error"; message: string };

function InterestBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="font-serif text-[13px] text-[var(--faint)] italic">interest unknown</span>;
  }
  return (
    <span className="font-serif text-[13px] text-[var(--muted-2)] italic">
      search interest <span className="text-[var(--ink)]">{value}</span>/100
    </span>
  );
}

export function PromptResearchPanel({
  projectId,
  defaultCountry,
}: {
  projectId: string;
  defaultCountry: string;
}) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleResearch() {
    const term = seed.trim();
    if (!term) return;
    setState({ phase: "loading" });
    try {
      const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/prompt-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: term, country }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Backend returned ${res.status} ${res.statusText}`);
      }
      const data: PromptResearchResponse = await res.json();
      setState({ phase: "done", candidates: data.candidates });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Could not reach the backend.",
      });
    }
  }

  function track(candidate: PromptCandidate) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("query_text", candidate.prompt_text);
      formData.set("prompt_type", "citation");
      // Track it in the market it was researched for — otherwise the Trends
      // score that justified adding it describes a different country than
      // the one the prompt will actually be run against.
      formData.set("country", country);
      // Was rendered as a badge and then dropped on the floor here — this is
      // the one place a search_volume score exists to persist.
      if (candidate.search_interest !== null) {
        formData.set("search_volume", String(candidate.search_interest));
      }
      await addPrompt(formData);
      setTracked((prev) => new Set(prev).add(candidate.prompt_text));
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end gap-3 border-b border-[var(--rule)] py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="border border-[var(--ink)] px-4.5 py-2.5 font-sans text-xs tracking-[0.06em] uppercase"
          style={{
            background: open ? "transparent" : "var(--ink)",
            color: open ? "var(--ink)" : "var(--cream)",
          }}
        >
          {open ? "Cancel" : "Research prompts"}
        </button>
      </div>

      {open && (
        <section className="border-b border-[var(--rule)] bg-[var(--paper)] px-1 py-6.5">
          <div className="grid grid-cols-[1fr_190px_auto] items-end gap-5">
            <div>
              <label
                htmlFor="research-seed"
                className="text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase"
              >
                Seed term or category
              </label>
              <input
                id="research-seed"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleResearch()}
                placeholder="e.g. smartphone"
                className="mt-2.5 w-full border-0 border-b border-[var(--ink)] bg-transparent py-2 font-serif text-2xl text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
              />
            </div>
            <div>
              <label
                htmlFor="research-country"
                className="text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase"
              >
                Market
              </label>
              <select
                id="research-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-2.5 w-full border-0 border-b border-[var(--ink)] bg-transparent py-2.5 font-sans text-[15px] text-[var(--ink)] outline-none"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleResearch}
              disabled={state.phase === "loading" || !seed.trim()}
              className="border border-[var(--rust)] bg-[var(--rust)] px-5 py-2.5 font-sans text-xs tracking-[0.06em] text-[var(--paper)] uppercase disabled:opacity-60"
            >
              {state.phase === "loading" ? "Researching…" : "Research"}
            </button>
          </div>
          <p className="mt-3 font-serif text-[13px] text-[var(--faint)] italic">
            Candidate prompts are AI-generated (Groq) — a brainstorm, not measured AI traffic.
            Search interest, where shown, is a real Google Trends relative score for{" "}
            {countryName(country)}, not an AI-prompt volume number (no such data exists anywhere).
            Tracking a candidate adds it against {countryName(country)}.
          </p>

          {state.phase === "error" && (
            <p className="mt-4 font-serif text-[14px] text-[var(--rust)] italic">{state.message}</p>
          )}

          {state.phase === "done" && (
            <div className="mt-5">
              {!state.candidates.length && (
                <p className="font-serif text-[15px] text-[var(--muted-2)] italic">
                  No candidates came back — check GROQ_API_KEY is configured in backend/.env, or
                  try a different seed term.
                </p>
              )}
              {state.candidates.map((c) => {
                const isTracked = tracked.has(c.prompt_text);
                return (
                  <div
                    key={c.prompt_text}
                    className="grid grid-cols-[1fr_130px] items-center gap-5 border-t border-[var(--rule-light)] py-4"
                  >
                    <div>
                      <div className="font-serif text-[18px] leading-[1.3] text-[var(--ink)]">
                        {c.prompt_text}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3">
                        <span className="border border-[var(--rule)] px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-[var(--muted-2)] uppercase">
                          {c.topic || c.intent}
                        </span>
                        <InterestBadge value={c.search_interest} />
                        {c.relevance_note && (
                          <span className="font-serif text-[13px] text-[var(--muted-2)] italic">
                            {c.relevance_note}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <button
                        onClick={() => track(c)}
                        disabled={isPending || isTracked}
                        className="border px-3.5 py-2 font-sans text-[10.5px] tracking-[0.08em] uppercase whitespace-nowrap disabled:opacity-60"
                        style={{
                          borderColor: isTracked ? "var(--green)" : "var(--ink)",
                          background: isTracked ? "var(--green)" : "transparent",
                          color: isTracked ? "var(--cream)" : "var(--ink)",
                        }}
                      >
                        {isTracked ? "Tracked" : "Track this"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </>
  );
}
