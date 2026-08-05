/** The two provenance/mention marks used across every data view.
 *
 * Visual language (matches the footer legend):
 *   ProvenanceDot — filled circle = real fetch, hollow = simulated
 *   MentionMark   — filled square = brand named, hollow = not, outline = unknown
 */

export function ProvenanceDot({ real }: { real: boolean }) {
  return (
    <span
      className="inline-block h-[6px] w-[6px] rounded-full"
      style={{
        background: real ? "var(--green)" : "transparent",
        border: `1px solid ${real ? "var(--green)" : "var(--faint)"}`,
      }}
    />
  );
}

export function ProvenanceLabel({ real }: { real: boolean }) {
  return (
    <span className="flex items-center gap-1.5 font-sans text-[12px] font-medium text-[var(--muted-2)]">
      <ProvenanceDot real={real} />
      {real ? "real fetch" : "simulated"}
    </span>
  );
}

/** `value === null` means we couldn't determine it (e.g. the cited page
 * blocked our fetch) — deliberately distinct from a confirmed "no mention". */
export function MentionMark({ value, label }: { value: boolean | null; label?: string }) {
  const yes = value === true;
  const bg = yes ? "var(--tint-mint)" : "var(--muted)";
  const fg = yes ? "var(--tint-mint-fg)" : "var(--muted-2)";
  const text = label ?? (value === null ? "unknown" : yes ? "names you" : "no mention");

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-medium whitespace-nowrap"
      style={{ background: bg, color: fg }}
    >
      <span
        className="inline-block h-[6px] w-[6px] rounded-full"
        style={{ background: yes ? "var(--tint-mint-fg)" : "var(--faint)" }}
      />
      {text}
    </span>
  );
}
