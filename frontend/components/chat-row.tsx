import { AnswerText } from "@/components/answer-text";
import { EngineLabel } from "@/components/engine-icons";
import { MentionMark } from "@/components/marks";
import { countryName } from "@/lib/countries";
import type { RankedBrand } from "@/lib/highlight-brands";
import type { ChatRow as ChatRowType } from "@/lib/types";

/**
 * One captured answer — the base unit everything else in this app rolls up
 * from (Peec's own framing for "Chats"). Reuses AnswerText (built for the
 * prompt-detail page) rather than a second brand-highlighting
 * implementation; the only new work here is the row chrome around it.
 */
export function ChatRow({
  chat,
  engineName,
  ranked,
}: {
  chat: ChatRowType;
  engineName: string | undefined;
  ranked: RankedBrand[];
}) {
  return (
    <article className="border-b border-[var(--rule-light)] py-5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-sans text-[13px] font-medium">
          <EngineLabel name={engineName} />
        </span>
        <span className="text-[var(--border)]">·</span>
        <span className="font-sans text-[11px] text-[var(--muted-2)]">
          {countryName(chat.country ?? "") ?? chat.country ?? "—"}
        </span>
        <span className="text-[var(--border)]">·</span>
        <span className="font-sans text-[11px] text-[var(--faint)] tabular-nums">
          {new Date(chat.fetched_at).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
          })}
        </span>
        <span className="ml-auto">
          <MentionMark value={chat.brand_mentioned_in_answer} />
        </span>
      </div>

      {chat.prompt && (
        <div className="mb-2 font-serif text-[15px] text-[var(--ink)] italic">
          &ldquo;{chat.prompt.query_text}&rdquo;
          {chat.prompt.topic && (
            <span className="ml-2 font-sans text-[10.5px] font-normal text-[var(--faint)] not-italic">
              {chat.prompt.topic}
            </span>
          )}
        </div>
      )}

      <div className="rounded-[10px] border border-[var(--rule)] bg-[var(--paper)] p-3.5">
        <AnswerText text={chat.answer_text} brands={ranked} />
      </div>
    </article>
  );
}
