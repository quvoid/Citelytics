import { FetchCitationsButton } from "@/components/fetch-citations-button";
import { GeminiIcon, ChatGPTIcon } from "@/components/engine-icons";
import type { LayoutData } from "@/lib/layout-data";

export function TopBar({ data }: { data: LayoutData }) {
  const { projectId } = data;

  return (
    <header className="sticky top-0 z-10 flex items-center justify-end gap-4 bg-[var(--background)] px-8 py-4">
      <div className="flex items-center gap-2 rounded-full border border-[var(--rule)] bg-[var(--card)] px-3 py-1.5">
        <span title="Gemini" className="flex items-center gap-1.5 text-[11px] text-[var(--muted-2)]">
          <GeminiIcon size={14} />
        </span>
        <span className="h-3.5 w-px bg-[var(--rule)]" />
        <span title="ChatGPT" className="flex items-center gap-1.5 text-[11px] text-[var(--muted-2)]">
          <ChatGPTIcon size={14} />
        </span>
      </div>
      <FetchCitationsButton projectId={projectId} />
    </header>
  );
}
