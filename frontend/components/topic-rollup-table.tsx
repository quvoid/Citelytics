import { DownloadCsvButton } from "@/components/download-csv-button";

export type TopicRow = {
  topic: string;
  mentions: number;
  prior: number;
  sov: number;
  sovPrior: number;
};

function Delta({ current, prior, suffix = "" }: { current: number; prior: number; suffix?: string }) {
  const diff = current - prior;
  if (diff === 0) return <div className="font-serif text-[11px] text-[var(--faint)] italic">±0{suffix}</div>;
  return (
    <div
      className="font-serif text-[11px] italic"
      style={{ color: diff > 0 ? "var(--green)" : "var(--rust)" }}
    >
      {diff > 0 ? "+" : "−"}
      {Math.abs(diff)}
      {suffix}
    </div>
  );
}

const COLS = "1fr 130px 130px 140px 140px";

export function TopicRollupTable({ topics, compare = false }: { topics: TopicRow[]; compare?: boolean }) {
  return (
    <section>
      <div className="flex justify-end pt-4">
        <DownloadCsvButton
          filename="topic-rollup.csv"
          rows={topics.map((t) => ({
            topic: t.topic,
            mentions: t.mentions,
            prior_period: t.prior,
            share_of_voice_pct: t.sov,
            sov_prior_pct: t.sovPrior,
          }))}
          columns={[
            { key: "topic", label: "Topic" },
            { key: "mentions", label: "Mentions" },
            { key: "prior_period", label: "Prior period" },
            { key: "share_of_voice_pct", label: "Share of voice %" },
            { key: "sov_prior_pct", label: "SoV prior %" },
          ]}
        />
      </div>
      <div
        className="grid gap-6 border-b border-[var(--rule)] py-3.5 text-[11px] tracking-[0.12em] text-[var(--muted-2)] uppercase"
        style={{ gridTemplateColumns: COLS }}
      >
        <span>Topic</span>
        <span className="text-right">Mentions</span>
        <span className="text-right">Prior period</span>
        <span className="text-right">Share of voice</span>
        <span className="text-right">SoV prior</span>
      </div>
      {topics.map((t) => (
        <div
          key={t.topic}
          className="grid items-center gap-6 border-b border-[var(--rule-light)] py-5 hover:bg-[var(--paper)]"
          style={{ gridTemplateColumns: COLS }}
        >
          <div className="font-serif text-[19px] tracking-[-0.01em]">{t.topic}</div>
          <div className="text-right">
            <div className="font-serif text-[20px]">{t.mentions}</div>
            {compare && <Delta current={t.mentions} prior={t.prior} />}
          </div>
          <div className="text-right font-serif text-[17px] text-[var(--muted-2)]">{t.prior}</div>
          <div className="text-right">
            <div className="font-serif text-[20px]">{t.sov}%</div>
            {compare && <Delta current={t.sov} prior={t.sovPrior} suffix=" pts" />}
          </div>
          <div className="text-right font-serif text-[17px] text-[var(--muted-2)]">{t.sovPrior}%</div>
        </div>
      ))}
      {!topics.length && (
        <p className="border-b border-[var(--rule-light)] py-6 font-serif text-[15px] text-[var(--muted-2)] italic">
          No topics yet — prompts get a topic once they&apos;ve been classified by a fetch.
        </p>
      )}
    </section>
  );
}
