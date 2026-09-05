import type { ReactNode } from "react";

/** Surface for a single chart: title, one line of subtitle naming what is
 * plotted (which is why none of these charts carry a legend — they are all
 * single-measure), then the plot. */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-[14px] border border-[var(--rule)] bg-[var(--card)] p-5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="m-0 font-sans text-[15px] font-semibold tracking-[-0.005em] text-[var(--ink)]">
            {title}
          </h2>
          {subtitle && (
            // max-w caps line length at a readable measure — this card can
            // be 700-900px wide, and an unconstrained subtitle sentence was
            // measuring ~105 chars/line at that width (Impeccable audit).
            <p className="mt-1 mb-0 max-w-[54ch] font-sans text-[12.5px] text-[var(--muted-2)]">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="flex-none">{action}</div>}
      </div>
      {children}
    </section>
  );
}
