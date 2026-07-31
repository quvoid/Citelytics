import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import { NavTabs } from "@/components/nav-tabs";
import { FetchCitationsButton } from "@/components/fetch-citations-button";
import { GeminiIcon, ChatGPTIcon } from "@/components/engine-icons";

async function getHeaderStats() {
  const sb = createAnonServerClient();

  const { data: prompts } = await sb
    .from("prompts")
    .select("id, prompt_type")
    .eq("project_id", DEMO_PROJECT_ID);
  const promptIds = (prompts ?? []).map((p) => p.id);
  const citationPromptCount = (prompts ?? []).filter((p) => p.prompt_type === "citation").length;

  const [{ count: realCount }, { count: simCount }, { count: brandCount }] = await Promise.all([
    promptIds.length
      ? sb
          .from("citations")
          .select("id", { count: "exact", head: true })
          .in("prompt_id", promptIds)
          .eq("is_simulated", false)
      : Promise.resolve({ count: 0 }),
    promptIds.length
      ? sb
          .from("citations")
          .select("id", { count: "exact", head: true })
          .in("prompt_id", promptIds)
          .eq("is_simulated", true)
      : Promise.resolve({ count: 0 }),
    sb
      .from("tracked_urls")
      .select("id", { count: "exact", head: true })
      .eq("project_id", DEMO_PROJECT_ID),
  ]);

  return {
    promptCount: citationPromptCount,
    realCount: realCount ?? 0,
    simCount: simCount ?? 0,
    brandCount: brandCount ?? 0,
  };
}

export async function Header() {
  const { promptCount, realCount, simCount, brandCount } = await getHeaderStats();

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--ink)] bg-[var(--cream)]">
      <div className="mx-auto flex max-w-[1240px] items-end justify-between gap-8 px-10 pt-4.5 pb-3.5">
        <div className="flex items-baseline gap-3.5">
          <div className="font-serif text-[28px] leading-none font-medium tracking-[-0.015em]">
            Citelytics
          </div>
          <div className="font-serif text-[15px] text-[var(--muted-2)] italic">
            citation intelligence for Bajaj Consumer Care
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 border border-[var(--rule)] px-2.5 py-1.5">
            <span title="Gemini" className="flex items-center gap-1.5 text-[11px] text-[var(--muted-2)]">
              <GeminiIcon size={14} />
            </span>
            <span className="h-3.5 w-px bg-[var(--rule)]" />
            <span title="ChatGPT" className="flex items-center gap-1.5 text-[11px] text-[var(--muted-2)]">
              <ChatGPTIcon size={14} />
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] tracking-[0.09em] text-[var(--muted-2)] uppercase">
            <span
              className="h-[7px] w-[7px] rounded-full bg-[var(--green)]"
              style={{ animation: "pulse-dot 2.6s ease-in-out infinite" }}
            />
            <span>real · {realCount}</span>
            <span className="ml-2 h-[7px] w-[7px] rounded-full border border-[var(--faint)]" />
            <span>sim · {simCount}</span>
          </div>
          <FetchCitationsButton />
        </div>
      </div>
      <NavTabs promptCount={promptCount} brandCount={brandCount} />
    </header>
  );
}
