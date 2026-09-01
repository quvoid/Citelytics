import Link from "next/link";
import { FilterDropdown } from "@/components/filter-dropdown";
import { countryName } from "@/lib/countries";
import { formatRange } from "@/lib/metrics/period";
import type { DateRange, FilterOptions } from "@/lib/metrics/types";

const PRESETS: { key: string; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

export type FilterState = {
  preset: string;
  models?: string[];
  tag?: string[];
  /** How multiple `tag` entries combine — "or" (default) or "and". Only
   *  meaningful with 2+ tags selected. */
  tagMode?: "and" | "or";
  topic?: string[];
  country?: string[];
  /** System filter: "branded" | "non-branded" | an intent value, e.g.
   *  "intent:Commercial". One value, not a real dimension array — Peec
   *  treats these as tag-LIKE but there's only ever one active at a time
   *  in this implementation (branded state and intent are two separate
   *  facts about a prompt, not combinable the way real tags are). */
  system?: string;
};

/** Serialises filter state back into a URL, dropping empty values so a
 *  default view has a clean address.
 *
 *  `patch` overrides filter dimensions; `extra` carries unrelated scalar
 *  params (metric, rows, view) that must survive a filter click. They are
 *  separate arguments because merging them into one object needs an index
 *  signature, which then forbids the array-valued filter fields. */
export function buildFilterHref(
  basePath: string,
  state: FilterState,
  patch: Partial<FilterState> = {},
  extra: Record<string, string | undefined> = {},
): string {
  const qs = new URLSearchParams();
  const merged = { ...state, ...patch };

  if (merged.preset && merged.preset !== "30d") qs.set("range", merged.preset);
  for (const k of ["models", "tag", "topic", "country"] as const) {
    const v = (merged[k] ?? []).filter(Boolean).join(",");
    if (v) qs.set(k, v);
  }
  // Only worth carrying once 2+ tags are actually selected — otherwise it's
  // a stray param that means nothing yet.
  if (merged.tagMode === "and" && (merged.tag ?? []).length > 1) qs.set("tagMode", "and");
  if (merged.system) qs.set("system", merged.system);
  for (const [k, v] of Object.entries(extra)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/**
 * The one filter surface every metrics page shares: date range, model, topic,
 * tag, market.
 *
 * Deliberately compact, Peec-style dropdown buttons rather than an expanded
 * chip wall. The chip-wall version broke the page: each filter group was a
 * flex item that refused to shrink below its own content width (the
 * flexbox `min-width: auto` default), so once a project had 8+ topics the
 * row's true width — over 1300px measured — blew straight through the
 * container and forced a page-wide horizontal scrollbar. A closed dropdown
 * costs one fixed-width button no matter how many options sit behind it, so
 * this can't happen again by construction.
 *
 * It always prints the RESOLVED range rather than the label you picked.
 * "Last 30 days" is a request; if the last fetch was five days ago the honest
 * answer is a shorter window, and quietly comparing a padded range against a
 * complete one is how a dashboard invents a decline.
 */
export function FilterBar({
  basePath,
  state,
  options,
  resolvedRange,
  previousRange,
  extra = {},
  hideSystem = false,
}: {
  basePath: string;
  state: FilterState;
  options: FilterOptions;
  resolvedRange: DateRange;
  previousRange: DateRange | null;
  /** Non-filter params (metric, rows, view) that must survive a filter click. */
  extra?: Record<string, string | undefined>;
  /** metrics_filter_options' `system` (Branding/Intent) is computed only
   *  from prompt_type='citation' prompts — set true on any page scoped to a
   *  different prompt_type (Perception, Shopping) where that data would be
   *  silently wrong rather than just absent. */
  hideSystem?: boolean;
}) {
  const href = (patch: Partial<FilterState>) => buildFilterHref(basePath, state, patch, extra);
  const toSet = (arr: string[] | undefined) => new Set(arr ?? []);
  // Single-select dropdowns: picking an option replaces the selection.

  return (
    <section className="flex flex-col gap-2 border-b border-[var(--border)] py-3.5">
      {/* overflow-x-auto is the fallback, not the plan — with dropdowns this
          row should never need to scroll, but if a page adds one more
          control than fits on a small screen it scrolls internally instead
          of taking the whole document with it. */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        <div className="flex flex-none items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-0.5">
          {PRESETS.map((p) => (
            <Link
              key={p.key}
              href={href({ preset: p.key })}
              className="rounded-[6px] px-2.5 py-1 font-sans text-[12px] font-medium no-underline"
              style={{
                background: state.preset === p.key ? "var(--ink)" : "transparent",
                color: state.preset === p.key ? "var(--paper)" : "var(--muted-2)",
              }}
            >
              {p.label}
            </Link>
          ))}
        </div>

        {options.engines.length > 1 && (
          <FilterDropdown
            label="Model"
            activeLabel={
              state.models?.length === 1
                ? options.engines.find((e) => e.id === state.models![0])?.name === "openrouter"
                  ? "ChatGPT"
                  : (options.engines.find((e) => e.id === state.models![0])?.name ?? "Model")
                : undefined
            }
            options={options.engines.map((e) => ({
              id: e.id,
              label: e.name === "openrouter" ? "ChatGPT" : e.name === "gemini" ? "Gemini" : e.name,
              href: href({ models: [e.id] }),
            }))}
            selected={toSet(state.models)}
            allHref={href({ models: undefined })}
          />
        )}

        {options.topics.length > 0 && (
          <FilterDropdown
            label="Topic"
            activeLabel={
              state.topic?.length === 1
                ? options.topics.find((t) => t.id === state.topic![0])?.name
                : undefined
            }
            options={options.topics.map((t) => ({
              id: t.id,
              label: t.name,
              sublabel: String(t.promptCount),
              href: href({ topic: [t.id] }),
            }))}
            selected={toSet(state.topic)}
            allHref={href({ topic: undefined })}
          />
        )}

        {options.tags.length > 0 && (
          <>
            <FilterDropdown
              label="Tag"
              multiSelect
              activeLabel={
                state.tag?.length === 1
                  ? options.tags.find((t) => t.id === state.tag![0])?.name
                  : state.tag?.length
                    ? `Tag: ${state.tag.length}`
                    : undefined
              }
              options={options.tags.map((t) => {
                const current = state.tag ?? [];
                const isOn = current.includes(t.id);
                const next = isOn ? current.filter((id) => id !== t.id) : [...current, t.id];
                return {
                  id: t.id,
                  label: t.groupName ? `${t.groupName} / ${t.name}` : t.name,
                  sublabel: String(t.promptCount),
                  href: href({ tag: next.length ? next : undefined }),
                };
              })}
              selected={toSet(state.tag)}
              allHref={href({ tag: undefined, tagMode: undefined })}
            />
            {(state.tag?.length ?? 0) > 1 && (
              <div className="flex flex-none items-center gap-0.5 rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-0.5">
                {(["or", "and"] as const).map((m) => (
                  <Link
                    key={m}
                    href={href({ tagMode: m })}
                    className="rounded-[6px] px-2 py-1 font-sans text-[11px] font-medium uppercase no-underline"
                    style={{
                      background: (state.tagMode ?? "or") === m ? "var(--ink)" : "transparent",
                      color: (state.tagMode ?? "or") === m ? "var(--paper)" : "var(--muted-2)",
                    }}
                  >
                    {m}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {!hideSystem && (options.system.branded.length > 0 || options.system.intent.length > 0) && (
          <FilterDropdown
            label="System"
            activeLabel={
              state.system === "branded"
                ? "Branded"
                : state.system === "non-branded"
                  ? "Non-branded"
                  : state.system?.startsWith("intent:")
                    ? state.system.slice("intent:".length)
                    : undefined
            }
            options={[
              ...options.system.branded.map((b) => ({
                id: b.value ? "branded" : "non-branded",
                label: b.value ? "Branded" : "Non-branded",
                sublabel: String(b.promptCount),
                href: href({ system: b.value ? "branded" : "non-branded" }),
              })),
              ...options.system.intent.map((i) => ({
                id: `intent:${i.value}`,
                label: i.value,
                sublabel: String(i.promptCount),
                href: href({ system: `intent:${i.value}` }),
              })),
            ]}
            selected={new Set(state.system ? [state.system] : [])}
            allHref={href({ system: undefined })}
          />
        )}

        {options.countries.length > 1 && (
          <FilterDropdown
            label="Market"
            activeLabel={
              state.country?.length === 1 ? countryName(state.country[0]) ?? state.country[0] : undefined
            }
            options={options.countries.map((c) => ({
              id: c.code,
              label: countryName(c.code) ?? c.code,
              sublabel: String(c.promptCount),
              href: href({ country: [c.code] }),
            }))}
            selected={toSet(state.country)}
            allHref={href({ country: undefined })}
          />
        )}
      </div>

      <div className="font-sans text-[11.5px] text-[var(--faint)]">
        Showing <span className="text-[var(--muted-2)]">{formatRange(resolvedRange)}</span>
        {previousRange ? (
          <>
            {" "}
            · compared with{" "}
            <span className="text-[var(--muted-2)]">{formatRange(previousRange)}</span>
          </>
        ) : null}
      </div>
    </section>
  );
}
