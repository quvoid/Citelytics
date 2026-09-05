"use client";

import { useMemo, useState } from "react";
import { DownloadCsvButton } from "@/components/download-csv-button";
import { MentionMark } from "@/components/marks";

export type DomainGroup = {
  domain: string;
  domainType: string | null;
  citations: number;
  mentionRate: number;
  shareOfSources: number;
  owned: boolean;
  isNew: boolean;
  recentCount: number;
  priorCount: number;
  avgPosition: number | null;
  urls: { url: string; title: string; citations: number; mentions: boolean | null; contentType: string | null }[];
};

const MOVER_TABS = ["Top", "New", "Trending", "Losing"] as const;
type MoverTab = (typeof MOVER_TABS)[number];

const TYPE_COLORS: Record<string, string> = {
  Corporate: "var(--rust)",
  UGC: "#8C8478",
  Editorial: "var(--green)",
  Institutional: "#C08A2E",
  Reference: "#6B6357",
  Other: "#CFC5B2",
};
const TYPE_ORDER = ["Corporate", "UGC", "Editorial", "Institutional", "Reference", "Other"];
const UNCLASSIFIED = "Unclassified";

export function SourcesTable({ groups }: { groups: DomainGroup[] }) {
  const [open, setOpen] = useState<string | null>(groups[0]?.domain ?? null);
  const [tab, setTab] = useState<MoverTab>("Top");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const typeBreakdown = useMemo(() => {
    const totalCitations = groups.reduce((sum, g) => sum + g.citations, 0);
    const byType = new Map<string, number>();
    for (const g of groups) {
      const key = g.domainType ?? UNCLASSIFIED;
      byType.set(key, (byType.get(key) ?? 0) + g.citations);
    }
    const order = [...TYPE_ORDER, UNCLASSIFIED].filter((t) => byType.has(t));
    return order.map((type) => ({
      type,
      citations: byType.get(type) ?? 0,
      pct: totalCitations ? Math.round(((byType.get(type) ?? 0) / totalCitations) * 100) : 0,
      color: TYPE_COLORS[type] ?? "#DED5C6",
    }));
  }, [groups]);

  const typeFiltered = useMemo(
    () => (typeFilter ? groups.filter((g) => (g.domainType ?? UNCLASSIFIED) === typeFilter) : groups),
    [groups, typeFilter]
  );

  const filtered = useMemo(() => {
    switch (tab) {
      case "New":
        return typeFiltered.filter((g) => g.isNew);
      case "Trending":
        return typeFiltered
          .filter((g) => g.priorCount > 0 && g.recentCount > g.priorCount * 1.2)
          .sort((a, b) => b.recentCount / Math.max(1, b.priorCount) - a.recentCount / Math.max(1, a.priorCount));
      case "Losing":
        return typeFiltered
          .filter((g) => g.priorCount > 0 && g.recentCount < g.priorCount * 0.8)
          .sort((a, b) => a.recentCount / Math.max(1, a.priorCount) - b.recentCount / Math.max(1, b.priorCount));
      default:
        return typeFiltered;
    }
  }, [typeFiltered, tab]);

  const max = groups.length ? groups[0].citations : 1;

  return (
    <section>
      <div className="border-b border-[var(--rule)] pb-6">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="m-0 font-serif text-[20px] font-normal tracking-[-0.005em]">
            What kind of page gets cited{" "}
            <span className="font-serif text-[14px] text-[var(--muted-2)] italic">
              click a band to filter
            </span>
          </h2>
          {typeFilter && (
            <span className="font-serif text-[13px] text-[var(--rust)] italic">
              filtered to {typeFilter} — click again to clear
            </span>
          )}
        </div>
        <div className="flex h-[30px] overflow-hidden border border-[var(--ink)]">
          {typeBreakdown.map((t) => (
            <button
              key={t.type}
              onClick={() => setTypeFilter((v) => (v === t.type ? null : t.type))}
              title={`${t.type} — ${t.pct}%`}
              className="h-full border-r border-[var(--ink)] last:border-r-0"
              style={{
                width: `${t.pct}%`,
                background: t.color,
                opacity: !typeFilter || typeFilter === t.type ? 1 : 0.3,
              }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-5">
          {typeBreakdown.map((t) => (
            <button
              key={t.type}
              onClick={() => setTypeFilter((v) => (v === t.type ? null : t.type))}
              className="flex items-center gap-1.5 bg-transparent"
              style={{ opacity: !typeFilter || typeFilter === t.type ? 1 : 0.4 }}
            >
              <span className="h-[9px] w-[9px]" style={{ background: t.color }} />
              <span className="text-[12px] text-[var(--muted-2)]">{t.type}</span>
              <span className="font-serif text-[14px] text-[var(--faint)]">{t.pct}%</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-6 border-b border-[var(--rule)] pt-5">
        <div className="flex gap-6">
          {MOVER_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="border-b-2 pb-2.5 font-sans text-[12px] tracking-[0.06em] uppercase"
              style={{
                borderColor: tab === t ? "var(--rust)" : "transparent",
                color: tab === t ? "var(--ink)" : "var(--muted-2)",
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="pb-2.5">
          <DownloadCsvButton
            filename="sources.csv"
            rows={filtered.map((g) => ({
              domain: g.domain,
              domain_type: g.domainType,
              avg_position: g.avgPosition,
              citations: g.citations,
              mention_rate_pct: g.mentionRate,
              share_of_sources_pct: g.shareOfSources,
              owned: g.owned ? "yes" : "no",
            }))}
            columns={[
              { key: "domain", label: "Domain" },
              { key: "domain_type", label: "Domain type" },
              { key: "avg_position", label: "Avg position" },
              { key: "citations", label: "Citations" },
              { key: "mention_rate_pct", label: "Mention rate %" },
              { key: "share_of_sources_pct", label: "Share of sources %" },
              { key: "owned", label: "Owned" },
            ]}
          />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_90px_100px_130px_150px] gap-6 border-b border-[var(--rule)] py-3.5 text-[11px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
        <span>Domain</span>
        <span className="text-right">Position</span>
        <span className="text-right">Citations</span>
        <span className="text-right">Mention rate</span>
        <span className="text-right">Share of sources</span>
      </div>
      {filtered.map((g, i) => (
        <div key={g.domain}>
          <div
            onClick={() => setOpen((v) => (v === g.domain ? null : g.domain))}
            className="grid cursor-pointer grid-cols-[1fr_90px_100px_130px_150px] items-center gap-6 border-b border-[var(--rule-light)] py-5 hover:bg-[var(--paper)]"
          >
            <div className="flex items-baseline gap-3">
              <span className="w-[20px] font-serif text-[13px] text-[var(--faint)] italic">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <div className="font-serif text-[21px] tracking-[-0.01em]">{g.domain}</div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  {g.owned && (
                    <span className="border border-[#B9CDBF] px-1.5 py-0.5 text-[11px] tracking-[0.1em] text-[var(--green)] uppercase">
                      owned
                    </span>
                  )}
                  {g.domainType && (
                    <span className="border border-[var(--rule)] px-1.5 py-0.5 text-[11px] tracking-[0.1em] text-[var(--muted-2)] uppercase">
                      {g.domainType}
                    </span>
                  )}
                  <span className="font-serif text-[12.5px] text-[var(--faint)] italic">
                    {g.urls.length} URL(s) · {open === g.domain ? "hide" : "show"}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-serif text-[19px] text-[var(--muted-2)]">
                {g.avgPosition !== null ? `#${g.avgPosition.toFixed(1)}` : "—"}
              </div>
              <div className="font-serif text-[11px] text-[var(--faint)] italic">avg rank</div>
            </div>
            <div className="text-right font-serif text-[23px]">{g.citations}</div>
            <div
              className="text-right font-serif text-[18px]"
              style={{ color: g.mentionRate === 0 ? "#C0B7A5" : g.mentionRate >= 30 ? "var(--green)" : "var(--ink)" }}
            >
              {g.mentionRate}%
            </div>
            <div>
              <div className="h-[4px] bg-[var(--rule-light)]">
                <div
                  className="h-[4px]"
                  style={{
                    width: `${Math.round((g.citations / max) * 100)}%`,
                    background: g.owned ? "var(--green)" : "#B7AC98",
                  }}
                />
              </div>
              <div className="mt-1.5 text-right font-serif text-[12.5px] text-[var(--muted-2)] italic">
                {g.shareOfSources}%
              </div>
            </div>
          </div>
          {open === g.domain && (
            <div className="border-b border-[var(--rule-light)] bg-[var(--paper)] py-1.5 pl-8">
              {g.urls.map((u) => (
                <div
                  key={u.url}
                  className="grid grid-cols-[1fr_100px_90px_150px] items-center gap-5 border-b border-[var(--rule-light)] py-3.5"
                >
                  <div>
                    <div className="font-serif text-[15px]">{u.title}</div>
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11.5px] break-all text-[var(--rust)]"
                    >
                      {u.url}
                    </a>
                  </div>
                  <div className="text-[11px] tracking-[0.06em] text-[var(--muted-2)] uppercase">
                    {u.contentType ?? "—"}
                  </div>
                  <div className="text-right font-serif text-[16px]">{u.citations}</div>
                  <div className="text-right">
                    <MentionMark value={u.mentions} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {!filtered.length && (
        <p className="border-b border-[var(--rule-light)] py-6 font-serif text-[15px] text-[var(--muted-2)] italic">
          {typeFilter
            ? `No ${typeFilter} domains in this view.`
            : tab === "Top"
            ? "No sources yet."
            : `No ${tab.toLowerCase()} domains yet — needs a few days of history.`}
        </p>
      )}
    </section>
  );
}
