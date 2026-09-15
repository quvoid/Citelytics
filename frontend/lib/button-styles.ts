/** The app's one button language, as class strings — pill-shaped, sentence
 *  case, Sora semibold. Every button and button-shaped link should use one
 *  of these rather than its own ad-hoc classes; the old boxy uppercase
 *  tracking-[0.06em] "editorial" buttons this replaces had drifted into
 *  four or five slightly different variants across the app (Download CSV,
 *  Copy, Analyse, Start tracking, Fetch perception...), which is exactly
 *  the "same thing, five different looks" inconsistency that reads as
 *  unfinished.
 *
 *  Three roles only:
 *   - primary   dark ink pill, the one main action on a screen
 *   - accent    ember pill, for a create/submit that should stand out
 *   - secondary outlined pill on card, for everything else (export, copy,
 *               cancel, toggles)
 *  Plus a `sm` size for dense spots (table toolbars, tag chips). */

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-full font-sans font-semibold whitespace-nowrap no-underline transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-60";

const md = "px-4.5 py-2.5 text-[12.5px]";
const sm = "px-3 py-1.5 text-[11.5px]";

export const buttonPrimary = `${base} ${md} border border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:opacity-85`;
export const buttonAccent = `${base} ${md} border border-[var(--ember)] bg-[var(--ember)] text-white hover:opacity-90`;
export const buttonSecondary = `${base} ${md} border border-[var(--rule)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--muted)]`;

export const buttonPrimarySm = `${base} ${sm} border border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:opacity-85`;
export const buttonAccentSm = `${base} ${sm} border border-[var(--ember)] bg-[var(--ember)] text-white hover:opacity-90`;
export const buttonSecondarySm = `${base} ${sm} border border-[var(--rule)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--muted)]`;
