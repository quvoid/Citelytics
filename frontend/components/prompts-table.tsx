"use client";

import { useTransition } from "react";
import { DownloadCsvButton } from "@/components/download-csv-button";
import { EmptyState } from "@/components/empty-state";
import { PromptDetailModal } from "@/components/prompt-detail-modal";
import { TagPicker } from "@/components/tag-picker";
import { setPromptActive } from "@/lib/actions/prompts";
import type { Prompt, Tag } from "@/lib/types";

export type PromptRow = Prompt & {
  /** The market this prompt's fetches use. Every prompt inherits the
   * project's `default_country` (chosen during onboarding) — there is no
   * per-prompt market control any more, so this is effectively the project
   * market, resolved once by the page. Still carried per row because the CSV
   * export records which market each row's numbers came from. */
  resolvedCountry: string;
  citations: number;
  mentions: number;
  real: boolean;
  lastFetched: string | null;
  avgSentiment: number | null;
  avgPosition: number | null;
  citeDelta: number;
  mentionDelta: number;
  tags: Tag[];
};

/** Explicit locale and timezone, because `toLocaleString()` uses the server's
 * locale during SSR and the browser's on hydration — "8/24/2026" vs
 * "24/8/2026" — which React reports as a hydration mismatch and then discards
 * the whole server tree to recover from. UTC also keeps this agreeing with
 * `captured_on`, which every metric is bucketed by. */
function formatFetchedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="font-sans text-[10.5px] text-[var(--faint)]">±0</span>;
  return (
    <span
      className="font-sans text-[10.5px] font-medium"
      style={{ color: value > 0 ? "var(--green)" : "var(--red)" }}
    >
      {value > 0 ? "+" : "−"}
      {Math.abs(value)}
    </span>
  );
}

function ToggleButton({ id, active }: { id: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => setPromptActive(id, !active))}
      disabled={isPending}
      className="rounded-full border px-2 py-0.5 font-sans text-[9.5px] font-medium tracking-[0.04em] uppercase disabled:opacity-60"
      style={{
        borderColor: active ? "var(--green)" : "var(--border)",
        background: active ? "var(--green)" : "transparent",
        color: active ? "#fff" : "var(--muted-2)",
      }}
    >
      {active ? "active" : "paused"}
    </button>
  );
}

/**
 * A real <table>, matching the dashboard density used everywhere else in
 * this rebuild (top-brands-table, kpi-strip). The previous version rendered
 * each prompt as a 19px serif headline plus an intent line plus a tag row —
 * five to six lines of type per row, and a
 * CSS-grid column spec (a `gridTemplateColumns` string) that had no
 * structural guarantee of lining up with the header's own copy of the same
 * string. A <table> makes that guarantee automatic and lets every row sit on
 * roughly one line, the way a dense tracking table should.
 */
export function PromptsTable({
  prompts,
  allTags,
  compare = false,
}: {
  prompts: PromptRow[];
  allTags: Tag[];
  compare?: boolean;
}) {
  return (
    <section
      className="rounded-[var(--radius-xl)] bg-[var(--card)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-end px-4 pt-3.5 pb-2.5">
        <DownloadCsvButton
          filename="prompts.csv"
          rows={prompts.map((p) => ({
            prompt: p.query_text,
            topic: p.topic,
            tags: p.tags.map((t) => t.name).join("; "),
            market: p.resolvedCountry,
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
            { key: "tags", label: "Tags" },
            { key: "market", label: "Market" },
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

      {/* This div owns the horizontal scroll, not the page — a narrow
          viewport gets a scrollable table instead of one that squeezes every
          column unreadably thin or blows out the document width. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr className="border-y border-[var(--border)] bg-[var(--muted)]">
              <th className="px-3 py-2 text-left font-sans text-[10.5px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">
                Prompt
              </th>
              <th className="px-3 py-2 text-right font-sans text-[10.5px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">
                Sent.
              </th>
              <th className="px-3 py-2 text-right font-sans text-[10.5px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">
                Pos.
              </th>
              <th className="px-3 py-2 text-right font-sans text-[10.5px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">
                Citations
              </th>
              <th className="px-3 py-2 text-right font-sans text-[10.5px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">
                Mentions
              </th>
              <th className="px-3 py-2 text-left font-sans text-[10.5px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">
                Last fetched
              </th>
              <th className="px-3 py-2 text-right font-sans text-[10.5px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">
                State
              </th>
            </tr>
          </thead>
          <tbody>
            {prompts.map((p) => (
              <tr
                key={p.id}
                className="border-b border-[var(--border)] align-top transition-colors duration-150 last:border-b-0 hover:bg-[var(--muted)]"
                style={{ opacity: p.active ? 1 : 0.55 }}
              >
                <td className="max-w-[320px] px-3 py-3">
                  {/* TagPicker deliberately sits OUTSIDE this trigger, not
                      inside — it renders its own buttons/select, and nesting
                      interactive controls inside another button is invalid
                      HTML and fights the click on every tag change.
                      The prompt text opens the answer-detail card (sources,
                      mini-searches, grounding supports); the card itself
                      carries a link on to the full page. */}
                  <PromptDetailModal
                    promptId={p.id}
                    queryText={p.query_text}
                    className="block w-full cursor-pointer text-left transition-transform duration-100 active:scale-[0.985]"
                  >
                    <div
                      className="truncate font-sans text-[13.5px] font-medium text-[var(--ink)] transition-colors duration-150 hover:text-[var(--ember)]"
                      title={p.query_text}
                    >
                      {p.query_text}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-sans text-[11px] text-[var(--muted-2)]">
                      {p.topic && <span className="truncate">{p.topic}</span>}
                      {p.intent && (
                        <>
                          <span className="text-[var(--border)]">·</span>
                          <span>{p.intent}</span>
                        </>
                      )}
                      {p.is_branded && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em] uppercase"
                          style={{ background: "var(--tint-peach)", color: "var(--tint-peach-fg)" }}
                        >
                          branded
                        </span>
                      )}
                    </div>
                  </PromptDetailModal>
                  {(p.tags.length > 0 || allTags.length > 0) && (
                    <div className="mt-1.5">
                      <TagPicker promptId={p.id} assigned={p.tags} allTags={allTags} />
                    </div>
                  )}
                </td>

                <td className="px-3 py-3 text-right font-sans text-[13px] tabular-nums">
                  {p.avgSentiment !== null ? Math.round(p.avgSentiment) : "—"}
                </td>
                <td className="px-3 py-3 text-right font-sans text-[13px] tabular-nums">
                  {p.avgPosition !== null ? `#${p.avgPosition.toFixed(1)}` : "—"}
                </td>

                <td className="px-3 py-3 text-right">
                  <div className="font-sans text-[13px] tabular-nums">{p.citations}</div>
                  {compare && <Delta value={p.citeDelta} />}
                </td>

                <td className="px-3 py-3 text-right">
                  <div
                    className="font-sans text-[13px] font-semibold tabular-nums"
                    style={{ color: p.mentions === 0 ? "var(--faint)" : "var(--green)" }}
                  >
                    {p.mentions}
                  </div>
                  <div className="font-sans text-[10.5px] text-[var(--faint)] tabular-nums">
                    {p.citations ? `${Math.round((p.mentions / p.citations) * 100)}%` : "—"}
                  </div>
                  {compare && <Delta value={p.mentionDelta} />}
                </td>

                <td className="px-3 py-3">
                  <div className="font-sans text-[12px] text-[var(--muted-2)] whitespace-nowrap">
                    {p.lastFetched ? formatFetchedAt(p.lastFetched) : "not yet fetched"}
                  </div>
                  {p.lastFetched && (
                    <div
                      className="mt-0.5 flex items-center gap-1 font-sans text-[10.5px]"
                      style={{ color: p.real ? "var(--green)" : "var(--faint)" }}
                    >
                      <span
                        className="inline-block h-[5px] w-[5px] rounded-full"
                        style={{
                          background: p.real ? "var(--green)" : "transparent",
                          border: `1px solid ${p.real ? "var(--green)" : "var(--faint)"}`,
                        }}
                      />
                      {p.real ? "real" : "simulated"}
                    </div>
                  )}
                </td>

                <td className="px-3 py-3 text-right">
                  <ToggleButton id={p.id} active={p.active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!prompts.length && <EmptyState title="No prompts yet" body="Add one above, or research some." />}
    </section>
  );
}
