"use client";

import { useRef, useState, useTransition } from "react";
import { addPrompt } from "@/lib/actions/prompts";

type Props = {
  /** Citation prompts are queried by every engine on each fetch run;
   * perception prompts are open brand-description questions run separately. */
  promptType: "citation" | "perception";
  toggleLabel: string;
  fieldLabel: string;
  placeholder: string;
};

/** Collapsed button that expands into a single-field composer. Shared by the
 * Prompts and Perception pages — they differ only in copy and prompt_type. */
export function PromptComposer({ promptType, toggleLabel, fieldLabel, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <div className="flex justify-end py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-full px-4.5 py-2.5 font-sans text-[12.5px] font-semibold transition-colors duration-150"
          style={{
            background: open ? "var(--muted)" : "var(--ink)",
            color: open ? "var(--ink)" : "var(--bg)",
          }}
        >
          {open ? "Cancel" : toggleLabel}
        </button>
      </div>

      {open && (
        <section
          className="mb-4 rounded-[var(--radius-xl)] bg-[var(--card)] p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <form
            ref={formRef}
            action={(formData) =>
              startTransition(async () => {
                formData.set("prompt_type", promptType);
                await addPrompt(formData);
                formRef.current?.reset();
                setOpen(false);
              })
            }
            className="grid grid-cols-[1fr_auto] items-end gap-5"
          >
            <div>
              <label className="font-sans text-[10.5px] font-semibold tracking-[0.06em] text-[var(--muted-2)] uppercase">
                {fieldLabel}
              </label>
              <input
                name="query_text"
                required
                placeholder={placeholder}
                className="mt-2.5 w-full rounded-[10px] border border-[var(--rule)] bg-[var(--muted)] px-3.5 py-3 font-sans text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--ember)]"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-full bg-[var(--ember)] px-5 py-3 font-sans text-[12.5px] font-semibold text-white transition-opacity duration-150 disabled:opacity-60"
            >
              {isPending ? "Adding…" : "Track prompt"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
