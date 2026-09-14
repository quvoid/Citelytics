"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, PlusCircle, Sparkles } from "lucide-react";

/** "Good morning, {brand}" header for Overview — the reference's greeting
 *  card, adapted: no user identity exists in this app (projects are brands,
 *  not people), so it greets the brand being tracked instead of a person's
 *  name, and the action row links to real destinations (no "New Event" —
 *  this app has no calendar) rather than literal copies of the reference's
 *  buttons.
 *
 *  Client component specifically so `new Date()` — inherently non-pure,
 *  wall-clock-dependent — never runs inside a Server Component's render
 *  body (react-hooks/purity flags exactly that; see the two pre-existing
 *  violations in app/prompts/page.tsx and app/sources/page.tsx this avoids
 *  repeating). Lazy useState initializer is the pattern React's own docs
 *  recommend for this. */
export function GreetingHeader({ brandName }: { brandName: string }) {
  const [now] = useState(() => new Date());
  const hour = now.getHours();
  const timeGreeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="m-0 font-sans text-[22px] leading-[1.25] font-bold tracking-[-0.015em] sm:text-[26px] sm:leading-[1.2]">
          Good {timeGreeting} — tracking <span className="text-[var(--ember)]">{brandName}</span>
        </h1>
        <p className="mt-1.5 font-sans text-[13px] text-[var(--muted-2)]">{dateLabel}</p>
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-none">
        <Link
          href="/prompts"
          className="flex items-center gap-1.5 rounded-full border border-[var(--rule)] bg-[var(--card)] px-3.5 py-2 font-sans text-[12.5px] font-semibold text-[var(--ink)] no-underline transition-colors duration-150 hover:bg-[var(--muted)]"
        >
          <PlusCircle size={14} strokeWidth={2} aria-hidden="true" />
          Add a prompt
        </Link>
        <Link
          href="/briefs/new"
          className="flex items-center gap-1.5 rounded-full border border-[var(--rule)] bg-[var(--card)] px-3.5 py-2 font-sans text-[12.5px] font-semibold text-[var(--ink)] no-underline transition-colors duration-150 hover:bg-[var(--muted)]"
        >
          <FileText size={14} strokeWidth={2} aria-hidden="true" />
          New brief
        </Link>
        <Link
          href="/insights"
          className="flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-3.5 py-2 font-sans text-[12.5px] font-semibold text-[var(--bg)] no-underline transition-opacity duration-150 hover:opacity-85"
        >
          <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
          Full insights
        </Link>
      </div>
    </div>
  );
}
