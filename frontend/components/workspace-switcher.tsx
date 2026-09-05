"use client";

import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCurrentProject } from "@/lib/actions/workspace";
import type { Project } from "@/lib/types";

const MARK_COLORS = ["var(--ember)", "var(--green)", "#6d4fd1", "#1c7ed6"];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

/** Brand logo by convention: public/logos/<domain>.png. Falls back to the
 * coloured initials mark when a project has no logo file — which is the
 * normal case for a newly tracked brand, not an error. object-contain keeps
 * wide wordmarks (Bajaj) undistorted in the same square slot that square
 * marks (Motorola) fill edge to edge.
 *
 * `hasLogo` (from lib/logo-domains.ts, checked server-side once and passed
 * down from the layout) skips the <img> — and the network request behind
 * it — entirely for a domain known to have no logo file, rather than
 * finding out via a failed request on every single page load, since this
 * component renders on every page via the sidebar. */
function BrandMark({
  name,
  domain,
  fallbackColor,
  className,
  hasLogo,
}: {
  name: string;
  domain: string;
  fallbackColor: string;
  className: string;
  hasLogo: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!domain || !hasLogo || failed) {
    return (
      <span
        className={`${className} flex flex-none items-center justify-center font-semibold text-white`}
        style={{ background: fallbackColor }}
      >
        {initialsFor(name).toUpperCase()}
      </span>
    );
  }

  return (
    <span
      className={`${className} flex flex-none items-center justify-center overflow-hidden bg-white`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static file in
          public/, no remote host to configure and no layout shift to optimise */}
      <img
        src={`/logos/${domain}.png`}
        alt=""
        className="h-full w-full object-contain p-[3px]"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export function WorkspaceSwitcher({
  current,
  projects,
  logoDomains,
}: {
  current: Project;
  projects: Project[];
  /** Domains actually confirmed to have a /logos/ file — from
   *  lib/logo-domains.ts, checked server-side once by Sidebar (this renders
   *  on every page). */
  logoDomains: string[];
}) {
  const knownLogos = useMemo(() => new Set(logoDomains), [logoDomains]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!open) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [open]);

  function selectProject(id: string) {
    if (id === current.id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await setCurrentProject(id);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="flex w-full items-center gap-2.5 rounded-[10px] border py-2 pr-2.5 pl-2 font-sans transition-colors duration-150 disabled:opacity-60"
        style={{
          background: open ? "var(--sb-active-bg)" : "transparent",
          borderColor: open ? "var(--sb-border)" : "transparent",
        }}
      >
        <BrandMark
          name={current.name}
          domain={current.domain}
          fallbackColor={
            MARK_COLORS[projects.findIndex((p) => p.id === current.id) % MARK_COLORS.length]
          }
          className="h-6.5 w-6.5 rounded-[7px] text-[10px] tracking-[0.02em]"
          hasLogo={knownLogos.has(current.domain)}
        />
        <span className="flex-1 overflow-hidden text-left font-sans text-[13.5px] font-medium overflow-ellipsis whitespace-nowrap text-white">
          {current.name}
        </span>
        <ChevronsUpDown
          size={14}
          strokeWidth={1.9}
          aria-hidden="true"
          className="flex-none"
          style={{ color: "var(--sb-text)" }}
        />
      </button>

      {open && (
        <div
          className="absolute top-[calc(100%+8px)] left-0 z-40 w-[280px] overflow-hidden rounded-[14px] border border-[var(--rule)] bg-[var(--card)]"
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          <div className="border-b border-[var(--rule-light)] px-3.5 py-2.5 font-sans text-[10.5px] font-semibold tracking-[0.08em] text-[var(--muted-2)] uppercase">
            Tracked brands
          </div>
          {projects.map((p, i) => (
            <button
              key={p.id}
              onClick={() => selectProject(p.id)}
              className="flex w-full items-center gap-2.5 border-b border-[var(--rule-light)] py-3 pr-3.5 pl-3.5 text-left font-sans transition-colors duration-150 hover:bg-[var(--muted)]"
              style={{ background: p.id === current.id ? "var(--muted)" : "transparent" }}
            >
              <BrandMark
                name={p.name}
                domain={p.domain}
                fallbackColor={MARK_COLORS[i % MARK_COLORS.length]}
                className="h-7 w-7 rounded-[8px] text-[10px]"
                hasLogo={knownLogos.has(p.domain)}
              />
              <span className="flex-1">
                <span className="block font-sans text-[14px] font-medium tracking-[-0.005em]">{p.name}</span>
                <span className="mt-0.5 block text-[11px] text-[var(--muted-2)]">{p.domain}</span>
              </span>
              {p.id === current.id && (
                <span className="rounded-full bg-[var(--tint-mint)] px-2 py-0.5 font-sans text-[10px] font-medium text-[var(--tint-mint-fg)]">
                  current
                </span>
              )}
            </button>
          ))}
          <Link
            href="/projects/new"
            onClick={() => setOpen(false)}
            className="block w-full py-3 pr-3.5 pl-3.5 font-sans text-[12px] font-medium tracking-[0.02em] text-[var(--ember)] no-underline transition-colors duration-150 hover:bg-[var(--muted)]"
          >
            + Track a new brand
          </Link>
        </div>
      )}
    </div>
  );
}
