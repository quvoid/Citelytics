"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCurrentProject } from "@/lib/actions/workspace";
import type { Project } from "@/lib/types";

const MARK_COLORS = ["var(--ember)", "var(--green)", "#6d4fd1", "#1c7ed6"];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

export function WorkspaceSwitcher({
  current,
  projects,
}: {
  current: Project;
  projects: Project[];
}) {
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
        <span
          className="flex h-6.5 w-6.5 flex-none items-center justify-center rounded-[7px] text-[10px] font-semibold tracking-[0.02em] text-white"
          style={{ background: MARK_COLORS[projects.findIndex((p) => p.id === current.id) % MARK_COLORS.length] }}
        >
          {initialsFor(current.name).toUpperCase()}
        </span>
        <span className="flex-1 overflow-hidden text-left font-sans text-[13.5px] font-medium overflow-ellipsis whitespace-nowrap text-white">
          {current.name}
        </span>
        <span className="flex-none pl-0.5 text-[8px]" style={{ color: "var(--sb-text)" }}>
          ▼
        </span>
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
              <span
                className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] text-[10px] font-semibold text-white"
                style={{ background: MARK_COLORS[i % MARK_COLORS.length] }}
              >
                {initialsFor(p.name).toUpperCase()}
              </span>
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
