"use client";

import { useRef, useState, useTransition } from "react";
import { addPrompt } from "@/lib/actions/prompts";

export function AddPerceptionPromptForm() {
  const [open, setOpen] = useState(false);
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
          {open ? "Cancel" : "Add a perception prompt"}
        </button>
      </div>

      {open && (
        <section className="grid grid-cols-[1fr_auto] items-end gap-5 border-b border-[var(--rule)] bg-[var(--paper)] px-1 py-6.5">
          <form
            ref={formRef}
            action={(formData) =>
              startTransition(async () => {
                formData.set("prompt_type", "perception");
                await addPrompt(formData);
                formRef.current?.reset();
                setOpen(false);
              })
            }
            className="col-span-2 grid grid-cols-[1fr_auto] items-end gap-5"
          >
            <div>
              <label className="text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
                Open brand-description prompt
              </label>
              <input
                name="query_text"
                required
                placeholder="e.g. How would you describe Bajaj Almond Drops as a brand?"
                className="mt-2.5 w-full border-0 border-b border-[var(--ink)] bg-transparent py-2 font-serif text-2xl text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="border border-[var(--rust)] bg-[var(--rust)] px-5 py-2.5 font-sans text-xs tracking-[0.06em] text-[var(--paper)] uppercase disabled:opacity-60"
            >
              {isPending ? "Adding…" : "Track prompt"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
