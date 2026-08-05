import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { getContentBriefs } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const briefs = await getContentBriefs();
  const scoredCount = briefs.filter((b) => b.status === "scored").length;

  return (
    <div>
      <section className="flex items-end justify-between gap-10 border-b border-[var(--ink)] py-9">
        <div>
          <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">
            Content briefs
          </h1>
          <p className="mt-2.5 font-serif text-[16px] text-[var(--muted-2)] italic">
            {briefs.length} brief{briefs.length === 1 ? "" : "s"}, {scoredCount} analysed — each
            one answers a prompt or gap where you&apos;re currently absent.
          </p>
        </div>
        <Link
          href="/briefs/new"
          className="whitespace-nowrap border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 font-sans text-xs tracking-[0.06em] text-[var(--cream)] uppercase no-underline hover:border-[var(--rust)] hover:bg-[var(--rust)]"
        >
          + New brief
        </Link>
      </section>

      <section>
        <div className="grid grid-cols-[1fr_110px_150px] gap-6 border-b border-[var(--rule)] py-3.5 text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
          <span>Prompt / topic</span>
          <span className="text-right">Score</span>
          <span className="text-right">Created</span>
        </div>
        {briefs.map((b) => (
          <Link
            key={b.id}
            href={`/briefs/${b.id}`}
            className="grid grid-cols-[1fr_110px_150px] items-center gap-6 border-b border-[var(--rule-light)] py-5 no-underline hover:bg-[var(--paper)]"
          >
            <div>
              <div className="font-serif text-[19px] leading-[1.3] tracking-[-0.01em] text-[var(--ink)]">
                {b.prompt_text}
              </div>
              <div className="mt-1.5 font-serif text-[13px] text-[var(--faint)] italic">
                {b.origin}
              </div>
            </div>
            <div
              className="text-right font-serif text-[24px]"
              style={{
                color:
                  b.score === null ? "var(--faint)" : b.score >= 75 ? "var(--green)" : "var(--ink)",
              }}
            >
              {b.score ?? "—"}
            </div>
            <div className="text-right text-[12.5px] text-[var(--muted-2)]">
              {new Date(b.created_at).toLocaleDateString()}
            </div>
          </Link>
        ))}
        {!briefs.length && (
          <EmptyState
            title="No briefs yet"
            body="Start one from Gap Analysis, or click “+ New brief” above."
          />
        )}
      </section>
    </div>
  );
}
