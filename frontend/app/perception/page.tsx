import { PromptComposer } from "@/components/prompt-composer";
import { BarList } from "@/components/bar-list";
import { ChartCard } from "@/components/chart-card";
import { FetchPerceptionButton } from "@/components/fetch-perception-button";
import { FilterBar, type FilterState } from "@/components/filter-bar";
import { SegmentHeatmap } from "@/components/segment-heatmap";
import { getCurrentProjectId } from "@/lib/current-project";
import { countryName } from "@/lib/countries";
import {
  getBrandAttributes,
  getProject,
  getPrompts,
  getRawResponses,
  getTrackedUrls,
} from "@/lib/queries";
import { getFilterOptions, parseMetricsFilter, resolveFilterScope } from "@/lib/metrics";
import type { SegmentMatrix } from "@/lib/metrics/types";

// Below this, a prevalence rate is noise — one association out of two
// answers isn't a real pattern yet. Same discipline as
// lib/metrics/finalize.ts's MIN_OBS_FOR_MEAN, applied locally since
// perception has no RPC rollup to enforce it centrally.
const MIN_RESPONSES_FOR_PROMINENCE = 3;

export const dynamic = "force-dynamic";

const RADAR_SIZE = 340;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = RADAR_SIZE / 2 - 46;
/** Three-series categorical set, assigned in fixed order so a brand keeps its
 * colour when the competitor set changes. The previous trio failed on two
 * counts: #8C8478 sat at chroma 0.02 (reads as grey, so it did no identity
 * work at all) and its worst pair cleared only ΔE 14 for full-colour readers.
 * These clear all-pairs CVD at ΔE 9.0 protan / 12.9 tritan and 28.6 normal. */
const SERIES_COLORS = ["var(--ember)", "var(--tint-lavender-fg)", "var(--tint-mint-fg)"];

function polarPoint(index: number, total: number, value: number) {
  const angle = -Math.PI / 2 + index * ((2 * Math.PI) / total);
  const r = RADAR_RADIUS * value;
  return { x: RADAR_CENTER + r * Math.cos(angle), y: RADAR_CENTER + r * Math.sin(angle) };
}

export default async function PerceptionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const projectId = await getCurrentProjectId();
  const filterOptions = await getFilterOptions(projectId);
  const parsed = parseMetricsFilter(sp, projectId, filterOptions);
  // 'perception' explicitly — metrics_scoped_prompts defaults to 'citation',
  // and this page's prompts are never that. See resolveFilterScope's doc.
  const scope = await resolveFilterScope(parsed, "perception");

  const [brands, allPerceptionPrompts, project] = await Promise.all([
    getTrackedUrls(),
    getPrompts("perception"),
    getProject(projectId),
  ]);
  const defaultCountry = project?.default_country ?? "IN";

  const scopedIds = new Set(scope.promptIds);
  const perceptionPrompts = allPerceptionPrompts.filter((p) => scopedIds.has(p.id));

  const state: FilterState = {
    preset: parsed.preset,
    models: parsed.engineIds,
    tag: parsed.tagIds,
    tagMode: parsed.tagMode,
    topic: parsed.topicIds,
    country: parsed.countries,
  };

  // Perception answers live on perception-type prompts only, so scope the
  // raw-response lookup to the FilterBar-scoped prompt set above, in one
  // batched call rather than one query per prompt.
  const rawResponses = await getRawResponses(undefined, {
    promptIds: perceptionPrompts.map((p) => p.id),
    fromDate: scope.resolvedRange.from,
    toDate: scope.resolvedRange.to,
  });
  const rawResponseIds = rawResponses.map((r) => r.id);
  const attributes = await getBrandAttributes(rawResponseIds);

  const own = brands.find((b) => !b.is_competitor) ?? null;

  // Association score per attribute, for YOUR brand
  const ownAttributeCounts = new Map<string, number>();
  for (const a of attributes) {
    if (a.tracked_url_id !== own?.id) continue;
    ownAttributeCounts.set(a.attribute, (ownAttributeCounts.get(a.attribute) ?? 0) + 1);
  }
  const ownAttributes = Array.from(ownAttributeCounts.entries()).sort((a, b) => b[1] - a[1]);

  // Radar: top attributes overall, compared across your brand + top 2 competitors by attribute volume
  const countsByBrand = new Map<string, Map<string, number>>();
  for (const a of attributes) {
    const map = countsByBrand.get(a.tracked_url_id) ?? new Map<string, number>();
    map.set(a.attribute, (map.get(a.attribute) ?? 0) + 1);
    countsByBrand.set(a.tracked_url_id, map);
  }
  const brandTotals = brands
    .map((b) => ({
      brand: b,
      total: Array.from(countsByBrand.get(b.id)?.values() ?? []).reduce((s, v) => s + v, 0),
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
  const radarBrands = [
    ...(own ? [{ brand: own, total: brandTotals.find((x) => x.brand.id === own.id)?.total ?? 0 }] : []),
    ...brandTotals.filter((x) => x.brand.id !== own?.id).slice(0, 2),
  ].slice(0, 3);

  const overallCounts = new Map<string, number>();
  for (const map of countsByBrand.values()) {
    for (const [attr, count] of map.entries()) overallCounts.set(attr, (overallCounts.get(attr) ?? 0) + count);
  }
  const radarAttributes = Array.from(overallCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([attr]) => attr);
  const radarMax = Math.max(
    1,
    ...radarAttributes.map((attr) =>
      Math.max(...radarBrands.map((rb) => countsByBrand.get(rb.brand.id)?.get(attr) ?? 0))
    )
  );

  // Prominence score: occurrences of (brand, attribute) / total perception
  // responses analyzed × 100 — a plain prevalence rate. The denominator is
  // shared across brands on purpose: every perception answer is a real
  // "opportunity" for any brand to have been associated with any attribute,
  // so "in what % of all perception answers was X associated with Y" is an
  // honest, comparable question even though citation-style per-brand
  // response counts don't exist here (perception.py bypasses
  // store.save_fetch_result's per-brand mention rows entirely).
  const totalPerceptionResponses = rawResponseIds.length;
  const matrixBrands = brandTotals.slice(0, 8).map((x) => x.brand);
  const matrixAttributes = Array.from(overallCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([attr]) => attr);

  const perceptionMatrix: SegmentMatrix = {
    metric: "visibility", // reused purely for formatMetric's "%" rendering — not a real brand-visibility value
    brandId: own?.id ?? "",
    rowAxis: "brand",
    colAxis: "attribute",
    rowKeys: matrixBrands.map((b) => ({
      key: b.id,
      label: b.name,
      promptCount: countsByBrand.get(b.id)?.size ?? 0,
    })),
    colKeys: matrixAttributes.map((attr) => ({
      key: attr,
      label: attr,
      promptCount: brands.filter((b) => (countsByBrand.get(b.id)?.get(attr) ?? 0) > 0).length,
    })),
    cells: matrixBrands.flatMap((b) =>
      matrixAttributes.map((attr) => {
        const count = countsByBrand.get(b.id)?.get(attr) ?? 0;
        const suppressed = totalPerceptionResponses < MIN_RESPONSES_FOR_PROMINENCE;
        const value =
          count === 0 || suppressed || totalPerceptionResponses === 0
            ? null
            : Math.round((count / totalPerceptionResponses) * 100);
        return {
          rowKey: b.id,
          colKey: attr,
          value: {
            value,
            support: { responses: totalPerceptionResponses, observations: count, daysWithData: 0 },
            suppressed,
          },
        };
      }),
    ),
    ratesOnly: true,
  };

  return (
    <div>
      <section className="flex items-end justify-between gap-10 border-b border-[var(--ink)] py-11">
        <div>
          <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">Perception</h1>
          <p className="mt-2.5 max-w-[68ch] font-serif text-[16px] text-[var(--muted-2)] italic">
            What AI associates your brand with, from open brand-description prompts — separate
            from the citation-tracking prompts.
          </p>
        </div>
        <FetchPerceptionButton projectId={projectId} />
      </section>

      <FilterBar
        basePath="/perception"
        state={state}
        options={filterOptions}
        resolvedRange={scope.resolvedRange}
        previousRange={null}
        hideSystem
      />

      <PromptComposer
        promptType="perception"
        toggleLabel="Add a perception prompt"
        fieldLabel="Open brand-description prompt"
        placeholder="e.g. How would you describe Bajaj Almond Drops as a brand?"
        defaultCountry={defaultCountry}
      />

      <section className="grid grid-cols-1 gap-16 py-11 md:grid-cols-2">
        <div>
          <h2 className="m-0 mb-1.5 font-serif text-[24px] font-normal tracking-[-0.01em]">
            How AI describes {own?.name ?? "your brand"}
          </h2>
          <p className="m-0 mb-6 font-serif text-[14px] text-[var(--muted-2)] italic">
            Top attributes when AI is asked about {own?.name ?? "your brand"}
          </p>
          <BarList
            items={ownAttributes.map(([attribute, count]) => ({
              label: attribute,
              value: count,
              sublabel:
                totalPerceptionResponses >= MIN_RESPONSES_FOR_PROMINENCE
                  ? `${Math.round((count / totalPerceptionResponses) * 100)}% of answers`
                  : undefined,
            }))}
            unit="mentions"
            emptyLabel={
              perceptionPrompts.length === 0
                ? "No perception prompts yet — add one below, then click “Fetch perception now.”"
                : rawResponseIds.length === 0
                  ? "Prompts exist but none have been fetched yet — click “Fetch perception now” above."
                  : "No attributes extracted from the answers fetched so far."
            }
          />
        </div>

        <div>
          <h2 className="m-0 mb-1.5 font-serif text-[24px] font-normal tracking-[-0.01em]">
            Brand shape
          </h2>
          <p className="m-0 mb-6 font-serif text-[14px] text-[var(--muted-2)] italic">
            Attribute association vs. top competitors
          </p>
          {radarAttributes.length >= 3 && radarBrands.length ? (
            <>
              <svg viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`} className="w-full max-w-[400px]">
                {[0.25, 0.5, 0.75, 1].map((ring) => (
                  <polygon
                    key={ring}
                    points={radarAttributes
                      .map((_, i) => {
                        const p = polarPoint(i, radarAttributes.length, ring);
                        return `${p.x},${p.y}`;
                      })
                      .join(" ")}
                    fill="none"
                    stroke="var(--rule)"
                  />
                ))}
                {radarAttributes.map((attr, i) => {
                  const p = polarPoint(i, radarAttributes.length, 1.14);
                  return (
                    <text
                      key={attr}
                      x={p.x}
                      y={p.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="11"
                      fill="var(--muted-2)"
                    >
                      {attr}
                    </text>
                  );
                })}
                {radarBrands.map((rb, bi) => (
                  <polygon
                    key={rb.brand.id}
                    points={radarAttributes
                      .map((attr, i) => {
                        const value = (countsByBrand.get(rb.brand.id)?.get(attr) ?? 0) / radarMax;
                        const p = polarPoint(i, radarAttributes.length, value);
                        return `${p.x},${p.y}`;
                      })
                      .join(" ")}
                    fill={SERIES_COLORS[bi]}
                    fillOpacity={rb.brand.id === own?.id ? 0.25 : 0.12}
                    stroke={SERIES_COLORS[bi]}
                    strokeWidth={2}
                  />
                ))}
              </svg>
              <div className="mt-4 flex flex-wrap gap-4">
                {radarBrands.map((rb, bi) => (
                  <div key={rb.brand.id} className="flex items-center gap-1.5 text-[12px]">
                    <span
                      className="inline-block h-[8px] w-[8px] rounded-full"
                      style={{ background: SERIES_COLORS[bi] }}
                    />
                    {rb.brand.name}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="font-serif text-[15px] text-[var(--muted-2)] italic">
              Needs at least 3 distinct attributes across brands to draw a shape.
            </p>
          )}
        </div>
      </section>

      {matrixBrands.length > 0 && matrixAttributes.length > 0 && (
        <section className="border-t border-[var(--rule)] py-9">
          <ChartCard
            title="Attribute × brand"
            subtitle="Prominence score: how often each attribute is associated with each brand, as a share of all perception answers analyzed"
          >
            <SegmentHeatmap matrix={perceptionMatrix} />
          </ChartCard>
        </section>
      )}

      <section className="border-t border-[var(--rule)] py-9">
        <h2 className="m-0 mb-1.5 font-serif text-[24px] font-normal tracking-[-0.01em]">
          Perception prompts
        </h2>
        <p className="m-0 mb-6 font-serif text-[14px] text-[var(--muted-2)] italic">
          {perceptionPrompts.length} tracked
        </p>
        {perceptionPrompts.map((p) => (
          <div
            key={p.id}
            className="flex items-baseline justify-between gap-5 border-b border-[var(--rule-light)] py-3"
          >
            <span className="font-serif text-[15px]">&ldquo;{p.query_text}&rdquo;</span>
            <span className="shrink-0 font-sans text-[10px] tracking-[0.1em] text-[var(--faint)] uppercase">
              {countryName(p.country ?? defaultCountry)}
            </span>
          </div>
        ))}
        {!perceptionPrompts.length && (
          <p className="font-serif text-[14px] text-[var(--muted-2)] italic">
            No perception prompts yet.
          </p>
        )}
      </section>
    </div>
  );
}
