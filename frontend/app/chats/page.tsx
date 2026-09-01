import Link from "next/link";
import { ChatRow } from "@/components/chat-row";
import { EmptyState } from "@/components/empty-state";
import { FilterDropdown } from "@/components/filter-dropdown";
import { getCurrentProjectId } from "@/lib/current-project";
import { getAnswerBrandMentions, getChats, getEngines, getTrackedUrls } from "@/lib/queries";
import type { RankedBrand } from "@/lib/highlight-brands";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ engine?: string; page?: string }>;
}) {
  const { engine: engineParam, page: pageParam } = await searchParams;
  const projectId = await getCurrentProjectId();
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [engines, trackedUrls, { rows: chats, total }] = await Promise.all([
    getEngines(),
    getTrackedUrls(),
    getChats({ projectId, engineId: engineParam, limit: PAGE_SIZE, offset }),
  ]);

  const engineNameById = new Map(engines.map((e) => [e.id, e.name]));
  const trackedById = new Map(trackedUrls.map((t) => [t.id, t]));

  const mentions = await getAnswerBrandMentions(chats.map((c) => c.id));
  const rankedByResponse = new Map<string, RankedBrand[]>();
  for (const m of mentions) {
    if (!m.mentioned || m.position == null) continue;
    const t = trackedById.get(m.tracked_url_id);
    if (!t) continue;
    const list = rankedByResponse.get(m.raw_response_id) ?? [];
    list.push({ name: t.name, isOwn: !t.is_competitor, position: m.position, sentiment: m.sentiment_score });
    rankedByResponse.set(m.raw_response_id, list);
  }
  for (const list of rankedByResponse.values()) list.sort((a, b) => a.position - b.position);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number, e?: string) => {
    const qs = new URLSearchParams();
    if (e) qs.set("engine", e);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/chats?${s}` : "/chats";
  };

  return (
    <div className="pb-12">
      <section className="border-b border-[var(--border)] py-6">
        <h1 className="m-0 font-sans text-[26px] font-semibold tracking-[-0.02em]">Chats</h1>
        <p className="mt-1.5 font-sans text-[13.5px] text-[var(--muted-2)]">
          Every captured answer, newest first — {total} total. The base unit every metric in this app
          rolls up from.
        </p>
      </section>

      <section className="flex items-center gap-2 border-b border-[var(--border)] py-3.5">
        <FilterDropdown
          label="Model"
          activeLabel={
            engineParam
              ? (() => {
                  const name = engineNameById.get(engineParam);
                  return name === "openrouter" ? "ChatGPT" : name === "gemini" ? "Gemini" : name;
                })()
              : undefined
          }
          options={engines.map((e) => ({
            id: e.id,
            label: e.name === "openrouter" ? "ChatGPT" : e.name === "gemini" ? "Gemini" : e.name,
            href: pageHref(1, e.id),
          }))}
          selected={new Set(engineParam ? [engineParam] : [])}
          allHref={pageHref(1)}
        />
      </section>

      {chats.map((c) => (
        <ChatRow
          key={c.id}
          chat={c}
          engineName={engineNameById.get(c.engine_id)}
          ranked={rankedByResponse.get(c.id) ?? []}
        />
      ))}

      {!chats.length && (
        <EmptyState title="No chats yet" body="Run a fetch to start capturing AI answers." />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-4 font-sans text-[12.5px] text-[var(--muted-2)]">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1, engineParam)} className="text-[var(--ember)] no-underline">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1, engineParam)} className="text-[var(--ember)] no-underline">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
