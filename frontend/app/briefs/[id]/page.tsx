import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalyseBriefButton } from "@/components/analyse-brief-button";
import { BriefExportActions } from "@/components/brief-export-actions";
import { getContentBrief } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BriefDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const brief = await getContentBrief(id);
  if (!brief) notFound();

  const scored = brief.status === "scored";

  return (
    <div>
      <section className="border-b border-[var(--ink)] py-10">
        <div className="flex items-center justify-between gap-6">
          <Link
            href="/briefs"
            className="font-sans text-[11px] tracking-[0.11em] text-[var(--rust)] uppercase no-underline"
          >
            ← all briefs
          </Link>
          {scored && <BriefExportActions brief={brief} />}
        </div>
        <div className="mt-5 grid grid-cols-1 items-end gap-14 md:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="mb-4 text-[11px] tracking-[0.14em] text-[var(--rust)] uppercase">
              {brief.origin}
            </div>
            <h1 className="m-0 font-serif text-[38px] leading-[1.15] font-normal tracking-[-0.02em]">
              {brief.prompt_text}
            </h1>
          </div>
          <div className="text-right">
            <div className="text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
              Brief score
            </div>
            <div className="mt-1.5 font-serif text-[52px] leading-none">{brief.score ?? "—"}</div>
            <div className="mt-1 font-serif text-[13px] text-[var(--muted-2)] italic">
              {scored
                ? brief.score !== null && brief.score >= 75
                  ? "strong opportunity"
                  : "workable angle"
                : "not yet analysed"}
            </div>
          </div>
        </div>
      </section>

      {!scored && (
        <section className="max-w-[640px] py-10">
          <p className="font-serif text-[17px] leading-[1.6] text-[var(--muted-2)]">
            Citelytics reads this prompt and proposes tone, intent, article type and a takeaway
            set. Nothing is scored until the analysis runs.
          </p>
          <div className="mt-7">
            <AnalyseBriefButton briefId={brief.id} />
          </div>
        </section>
      )}

      {scored && (
        <>
          <section className="py-9">
            <div className="grid grid-cols-2 gap-px border border-[var(--rule)] bg-[var(--rule)] md:grid-cols-4">
              {[
                { label: "Tone of voice", value: brief.tone, note: brief.cell_notes?.tone },
                {
                  label: "Content intent",
                  value: brief.content_intent,
                  note: brief.cell_notes?.content_intent,
                },
                { label: "Language", value: brief.language, note: brief.cell_notes?.language },
                {
                  label: "Article type",
                  value: brief.article_type,
                  note: brief.cell_notes?.article_type,
                },
              ].map((c) => (
                <div key={c.label} className="bg-[var(--paper)] px-5 py-4.5">
                  <div className="text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
                    {c.label}
                  </div>
                  <div className="mt-2 font-serif text-[19px] leading-[1.2]">{c.value ?? "—"}</div>
                  {c.note && (
                    <div className="mt-1 font-serif text-[13px] text-[var(--faint)] italic">
                      {c.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 items-start gap-16 py-9 md:grid-cols-[1.4fr_1fr]">
            <div>
              {[
                { label: "Main topic", body: brief.main_topic },
                { label: "Value proposition", body: brief.value_proposition },
                { label: "Target audience", body: brief.target_audience },
              ].map((b) => (
                <div key={b.label} className="border-t border-[var(--rule)] py-5.5">
                  <div className="text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
                    {b.label}
                  </div>
                  <p className="mt-3 max-w-[60ch] font-serif text-[17px] leading-[1.6] text-pretty">
                    {b.body}
                  </p>
                </div>
              ))}
            </div>
            <div>
              <div className="border-t border-[var(--rule)] pt-5.5">
                <div className="text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
                  Key takeaways
                </div>
                {(brief.key_takeaways ?? []).map((t, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[26px_1fr] gap-2 border-b border-[var(--rule-light)] py-3.5"
                  >
                    <span className="font-serif text-[15px] text-[var(--faint)] italic">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-serif text-[16px] leading-[1.5] text-[var(--muted-2)]">
                      {t}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex gap-3">
                <button
                  disabled
                  title="Not yet available"
                  className="border border-[var(--rust)] bg-[var(--rust)] px-5 py-3 font-sans text-xs tracking-[0.06em] text-[var(--paper)] uppercase opacity-50"
                >
                  Write with AI
                </button>
                <button
                  disabled
                  title="Not yet available"
                  className="border border-[var(--ink)] px-5 py-3 font-sans text-xs tracking-[0.06em] text-[var(--ink)] uppercase opacity-50"
                >
                  Write manually
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
