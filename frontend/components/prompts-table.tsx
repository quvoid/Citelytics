"use client";

import Link from "next/link";
import { useTransition } from "react";
import { DownloadCsvButton } from "@/components/download-csv-button";
import { EmptyState } from "@/components/empty-state";
import { setPromptActive } from "@/lib/actions/prompts";
import type { Prompt } from "@/lib/types";

export type PromptRow = Prompt & {
  citations: number;
  mentions: number;
  real: boolean;
  lastFetched: string | null;
  avgSentiment: number | null;
  avgPosition: number | null;
  citeDelta: number;
  mentionDelta: number;
};

function DeltaText({ value }: { value: number }) {
  if (value === 0) return <div className="font-serif text-[11px] text-[var(--faint)] italic">±0</div>;
  return (
    <div
      className="font-serif text-[11px] italic"
      style={{ color: value > 0 ? "var(--green)" : "var(--rust)" }}
    >
      {value > 0 ? "+" : "−"}
      {Math.abs(value)} vs prior
    </div>
  );
}

function ToggleButton({ id, active }: { id: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => setPromptActive(id, !active))}
      disabled={isPending}
      className="border px-2.5 py-1 font-sans text-[10px] tracking-[0.1em] uppercase disabled:opacity-60"
      style={{
        borderColor: active ? "var(--green)" : "var(--rule)",
        background: active ? "var(--green)" : "transparent",
        color: active ? "var(--cream)" : "var(--muted-2)",
      }}
    >
      {active ? "active" : "paused"}
    </button>
  );
}

const COLS = "1.4fr 82px 72px 64px 100px 110px 150px 92px";

export function PromptsTable({ prompts, compare = false }: { prompts: PromptRow[]; compare?: boolean }) {
  return (
    <section>
      <div className="flex justify-end pt-4">
        <DownloadCsvButton
          filename="prompts.csv"
          rows={prompts.map((p) => ({
            prompt: p.query_text,
            topic: p.topic,
            intent: p.intent,
            branded: p.is_branded ? "yes" : "no",
            citations: p.citations,
            mentions: p.mentions,
            avg_sentiment: p.avgSentiment,
            avg_position: p.avgPosition,
            last_fetched: p.lastFetched,
            state: p.active ? "active" : "paused",
          }))}
          columns={[
            { key: "prompt", label: "Prompt" },
            { key: "topic", label: "Topic" },
            { key: "intent", label: "Intent" },
            { key: "branded", label: "Branded" },
            { key: "citations", label: "Citations" },
            { key: "mentions", label: "Mentions" },
            { key: "avg_sentiment", label: "Avg sentiment" },
            { key: "avg_position", label: "Avg position" },
            { key: "last_fetched", label: "Last fetched" },
            { key: "state", label: "State" },
          ]}
        />
      </div>
      <div
        className="grid gap-5 border-b border-[var(--rule)] py-3.5 text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase"
        style={{ gridTemplateColumns: COLS }}
      >
        <span>Prompt</span>
        <span>Topic</span>
        <span className="text-right">Sent.</span>
        <span className="text-right">Pos.</span>
        <span className="text-right">Citations</span>
        <span className="text-right">Mentions</span>
        <span>Last fetched</span>
        <span className="text-right">State</span>
      </div>
      {prompts.map((p) => (
        <div
          key={p.id}
          className="grid items-center gap-5 border-b border-[var(--rule-light)] py-5 hover:bg-[var(--paper)]"
          style={{ gridTemplateColumns: COLS, opacity: p.active ? 1 : 0.55 }}
        >
          <Link href={`/prompts/${p.id}`} className="no-underline">
            <div className="font-serif text-[19px] leading-[1.3] tracking-[-0.01em] text-[var(--ink)] hover:text-[var(--rust)]">
              {p.query_text}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] tracking-[0.08em] text-[var(--faint)] uppercase">
              {p.intent && <span>{p.intent}</span>}
              {p.is_branded && (
                <span className="border border-[var(--rule)] px-1.5 py-0.5 text-[var(--rust)]">
                  Branded
                </span>
              )}
            </div>
          </Link>
          <div className="font-serif text-[13px] text-[var(--muted-2)] italic">
            {p.topic ?? "—"}
          </div>
          <div className="text-right font-serif text-[16px]">
            {p.avgSentiment !== null ? Math.round(p.avgSentiment) : "—"}
          </div>
          <div className="text-right font-serif text-[16px]">
            {p.avgPosition !== null ? `#${p.avgPosition.toFixed(1)}` : "—"}
          </div>
          <div className="text-right">
            <div className="font-serif text-[20px]">{p.citations}</div>
            {compare && <DeltaText value={p.citeDelta} />}
          </div>
          <div className="text-right">
            <span
              className="font-serif text-[20px]"
              style={{ color: p.mentions === 0 ? "var(--faint)" : "var(--green)" }}
            >
              {p.mentions}
            </span>
            <div className="font-serif text-[11.5px] text-[var(--faint)] italic">
              {p.citations ? `${Math.round((p.mentions / p.citations) * 100)}%` : "—"}
            </div>
            {compare && <DeltaText value={p.mentionDelta} />}
          </div>
          <div className="text-[12px] text-[var(--muted-2)]">
            <div>{p.lastFetched ? new Date(p.lastFetched).toLocaleString() : "not yet fetched"}</div>
            {p.lastFetched && (
              <div
                className="mt-1 flex items-center gap-1.5 font-serif text-[12px] italic"
                style={{ color: p.real ? "var(--green)" : "var(--faint)" }}
              >
                <span
                  className="inline-block h-[6px] w-[6px] rounded-full"
                  style={{
                    background: p.real ? "var(--green)" : "transparent",
                    border: `1px solid ${p.real ? "var(--green)" : "var(--faint)"}`,
                  }}
                />
                {p.real ? "real fetch" : "simulated"}
              </div>
            )}
          </div>
          <div className="text-right">
            <ToggleButton id={p.id} active={p.active} />
          </div>
        </div>
      ))}
      {!prompts.length && <EmptyState title="No prompts yet" body="Add one above, or research some." />}
    </section>
  );
}
