"use client";

import { useMemo, useState } from "react";

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
  urls: { url: string; title: string; citations: number; mentions: boolean | null; contentType: string | null }[];
};

const MOVER_TABS = ["Top", "New", "Trending", "Losing"] as const;
type MoverTab = (typeof MOVER_TABS)[number];

function MentionMark({ value }: { value: boolean | null }) {
  const yes = value === true;
  const color = value === null ? "var(--faint)" : yes ? "var(--green)" : "var(--faint)";
  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-[9px] w-[9px]"
        style={{ background: yes ? "var(--green)" : "transparent", border: `1px solid ${color}` }}
      />
      <span className="text-[10.5px] tracking-[0.09em] whitespace-nowrap uppercase" style={{ color }}>
        {value === null ? "unknown" : yes ? "names you" : "no mention"}
      </span>
    </div>
  );
}

export function SourcesTable({ groups }: { groups: DomainGroup[] }) {
  const [open, setOpen] = useState<string | null>(groups[0]?.domain ?? null);
  const [tab, setTab] = useState<MoverTab>("Top");

  const filtered = useMemo(() => {
    switch (tab) {
      case "New":
        return groups.filter((g) => g.isNew);
      case "Trending":
        return groups
          .filter((g) => g.priorCount > 0 && g.recentCount > g.priorCount * 1.2)
          .sort((a, b) => b.recentCount / Math.max(1, b.priorCount) - a.recentCount / Math.max(1, a.priorCount));
      case "Losing":
        return groups
          .filter((g) => g.priorCount > 0 && g.recentCount < g.priorCount * 0.8)
          .sort((a, b) => a.recentCount / Math.max(1, a.priorCount) - b.recentCount / Math.max(1, b.priorCount));
      default:
        return groups;
    }
  }, [groups, tab]);

  const max = groups.length ? groups[0].citations : 1;

  return (
    <section>
      <div className="flex gap-6 border-b border-[var(--rule)] pt-2">
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
      <div className="grid grid-cols-[1fr_120px_130px_150px] gap-6 border-b border-[var(--rule)] py-3.5 text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
        <span>Domain</span>
        <span className="text-right">Citations</span>
        <span className="text-right">Mention rate</span>
        <span className="text-right">Share of sources</span>
      </div>
      {filtered.map((g, i) => (
        <div key={g.domain}>
          <div
            onClick={() => setOpen((v) => (v === g.domain ? null : g.domain))}
            className="grid cursor-pointer grid-cols-[1fr_120px_130px_150px] items-center gap-6 border-b border-[var(--rule-light)] py-5 hover:bg-[var(--paper)]"
          >
            <div className="flex items-baseline gap-3">
              <span className="w-[20px] font-serif text-[13px] text-[var(--faint)] italic">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <div className="font-serif text-[21px] tracking-[-0.01em]">{g.domain}</div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  {g.owned && (
                    <span className="border border-[#B9CDBF] px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-[var(--green)] uppercase">
                      owned
                    </span>
                  )}
                  {g.domainType && (
                    <span className="border border-[var(--rule)] px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-[var(--muted-2)] uppercase">
                      {g.domainType}
                    </span>
                  )}
                  <span className="font-serif text-[12.5px] text-[var(--faint)] italic">
                    {g.urls.length} URL(s) · {open === g.domain ? "hide" : "show"}
                  </span>
                </div>
              </div>
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
                  <div className="text-[10.5px] tracking-[0.06em] text-[var(--muted-2)] uppercase">
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
          {tab === "Top" ? "No sources yet." : `No ${tab.toLowerCase()} domains yet — needs a few days of history.`}
        </p>
      )}
    </section>
  );
}
