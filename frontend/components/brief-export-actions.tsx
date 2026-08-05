"use client";

import { CopyButton } from "@/components/copy-button";
import { downloadText } from "@/lib/csv";
import type { ContentBrief } from "@/lib/types";

function toMarkdown(brief: ContentBrief): string {
  const lines = [
    `# ${brief.prompt_text}`,
    "",
    `_${brief.origin}_`,
    "",
    `**Brief score:** ${brief.score ?? "—"}`,
    "",
    `| | |`,
    `|---|---|`,
    `| Tone of voice | ${brief.tone ?? "—"} |`,
    `| Content intent | ${brief.content_intent ?? "—"} |`,
    `| Language | ${brief.language ?? "—"} |`,
    `| Article type | ${brief.article_type ?? "—"} |`,
    "",
    "## Main topic",
    brief.main_topic ?? "—",
    "",
    "## Value proposition",
    brief.value_proposition ?? "—",
    "",
    "## Target audience",
    brief.target_audience ?? "—",
    "",
    "## Key takeaways",
    ...(brief.key_takeaways ?? []).map((t, i) => `${i + 1}. ${t}`),
  ];
  return lines.join("\n");
}

export function BriefExportActions({ brief }: { brief: ContentBrief }) {
  const markdown = toMarkdown(brief);
  const filename = `${brief.prompt_text.slice(0, 60).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;

  return (
    <div className="flex gap-3">
      <CopyButton text={markdown} label="Copy as Markdown" />
      <button
        onClick={() => downloadText(filename, markdown, "text/markdown;charset=utf-8")}
        className="border border-[var(--ink)] px-3.5 py-2 font-sans text-[10.5px] tracking-[0.08em] uppercase whitespace-nowrap hover:bg-[var(--ink)] hover:text-[var(--cream)]"
      >
        Download .md
      </button>
    </div>
  );
}
