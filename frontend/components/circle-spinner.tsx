/** The one authored loading moment for content-area transitions — a plain
 *  rotating ring, not a skeleton. Used both by the bottom-drawer's
 *  navigation feedback and by any Suspense boundary wrapping filter-driven
 *  content (e.g. Insights' date-range presets), so "clicking a category
 *  link" and "changing 7d to 30d" show the exact same loading language
 *  instead of two different loading idioms for what is, to the user, the
 *  same kind of wait: only the content area is refetching, chrome (bottom
 *  nav / sidebar) stays completely still. */
export function CircleSpinner({ size = 28 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-block animate-spin rounded-full"
      style={{
        width: size,
        height: size,
        border: `${Math.max(2, Math.round(size / 12))}px solid var(--muted)`,
        borderTopColor: "var(--ember)",
      }}
    />
  );
}

/** Fills the content column while a Suspense boundary's data is in flight —
 *  centered, generous vertical room so it doesn't read as a broken empty
 *  page while it's up. */
export function CircleSpinnerFill({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <CircleSpinner size={32} />
      {label && <p className="m-0 font-sans text-[12.5px] text-[var(--muted-2)]">{label}</p>}
    </div>
  );
}
