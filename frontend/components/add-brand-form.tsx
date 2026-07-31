"use client";

import { useRef, useState, useTransition } from "react";
import { addBrand } from "@/lib/actions/brands";

export function AddBrandForm() {
  const [open, setOpen] = useState(false);
  const [isCompetitor, setIsCompetitor] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <div className="flex justify-end border-b border-[var(--rule)] py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="border border-[var(--ink)] px-4.5 py-2.5 font-sans text-xs tracking-[0.06em] uppercase"
          style={{
            background: open ? "transparent" : "var(--ink)",
            color: open ? "var(--ink)" : "var(--cream)",
          }}
        >
          {open ? "Cancel" : "Add competitor"}
        </button>
      </div>

      {open && (
        <section className="border-b border-[var(--rule)] bg-[var(--paper)] px-1 py-6.5">
          <form
            ref={formRef}
            action={(formData) =>
              startTransition(async () => {
                formData.set("is_competitor", String(isCompetitor));
                await addBrand(formData);
                formRef.current?.reset();
                setOpen(false);
              })
            }
            className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-5"
          >
            <div>
              <label className="text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
                Brand name
              </label>
              <input
                name="name"
                placeholder="e.g. Mamaearth"
                className="mt-2.5 w-full border-0 border-b border-[var(--ink)] bg-transparent py-2 font-serif text-2xl text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
              />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
                Domain
              </label>
              <input
                name="url"
                required
                placeholder="e.g. mamaearth.in"
                className="mt-2.5 w-full border-0 border-b border-[var(--ink)] bg-transparent py-2 font-serif text-2xl text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
              />
            </div>
            <div className="flex overflow-hidden border border-[var(--ink)]">
              <button
                type="button"
                onClick={() => setIsCompetitor(false)}
                className="px-3.5 py-2.5 font-sans text-[11px] tracking-[0.06em] uppercase"
                style={{
                  background: !isCompetitor ? "var(--ink)" : "transparent",
                  color: !isCompetitor ? "var(--cream)" : "var(--muted-2)",
                }}
              >
                Our brand
              </button>
              <button
                type="button"
                onClick={() => setIsCompetitor(true)}
                className="border-l border-[var(--ink)] px-3.5 py-2.5 font-sans text-[11px] tracking-[0.06em] uppercase"
                style={{
                  background: isCompetitor ? "var(--ink)" : "transparent",
                  color: isCompetitor ? "var(--cream)" : "var(--muted-2)",
                }}
              >
                Competitor
              </button>
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="border border-[var(--rust)] bg-[var(--rust)] px-5 py-2.5 font-sans text-xs tracking-[0.06em] text-[var(--paper)] uppercase disabled:opacity-60"
            >
              {isPending ? "Adding…" : "Add brand"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
