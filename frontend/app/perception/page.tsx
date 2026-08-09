import { PromptComposer } from "@/components/prompt-composer";
import { FetchPerceptionButton } from "@/components/fetch-perception-button";
import { getCurrentProjectId } from "@/lib/current-project";
import { countryName } from "@/lib/countries";
import {
  getBrandAttributes,
  getProject,
  getPrompts,
  getRawResponses,
  getTrackedUrls,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const RADAR_SIZE = 340;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = RADAR_SIZE / 2 - 46;
const SERIES_COLORS = ["var(--rust)", "#8C8478", "#4A6FA5"];

function polarPoint(index: number, total: number, value: number) {
  const angle = -Math.PI / 2 + index * ((2 * Math.PI) / total);
  const r = RADAR_RADIUS * value;
  return { x: RADAR_CENTER + r * Math.cos(angle), y: RADAR_CENTER + r * Math.sin(angle) };
}

export default async function PerceptionPage() {
  const projectId = await getCurrentProjectId();
  const [brands, perceptionPrompts, project] = await Promise.all([
    getTrackedUrls(),
    getPrompts("perception"),
    getProject(projectId),
  ]);
  const defaultCountry = project?.default_country ?? "IN";

  // Perception answers live on perception-type prompts only, so scope the
  // raw-response lookup to each of them rather than the whole project.
  const rawResponsesByPrompt = await Promise.all(
    perceptionPrompts.map((p) => getRawResponses(p.id))
  );
  const rawResponseIds = rawResponsesByPrompt.flat().map((r) => r.id);
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
          {ownAttributes.map(([attribute, count]) => (
            <div
              key={attribute}
              className="flex items-center justify-between gap-4 border-b border-[var(--rule-light)] py-3"
            >
              <span className="text-[14px] text-[var(--ink)]">{attribute}</span>
              <span className="font-serif text-[18px] text-[var(--muted-2)]">{count}</span>
            </div>
          ))}
          {!ownAttributes.length && (
            <p className="font-serif text-[15px] text-[var(--muted-2)] italic">
              No perception data yet — add a prompt above and click &ldquo;Fetch perception
              now.&rdquo;
            </p>
          )}
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
