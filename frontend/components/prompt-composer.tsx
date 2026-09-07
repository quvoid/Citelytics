"use client";

import { useRef, useState, useTransition } from "react";
import { addPrompt } from "@/lib/actions/prompts";
import { countryName } from "@/lib/countries";
import type { Topic } from "@/lib/types";

const NEW_CATEGORY = "__new__";

type Props = {
  /** Citation prompts are queried by every engine on each fetch run;
   * perception prompts are open brand-description questions run separately. */
  promptType: "citation" | "perception";
  toggleLabel: string;
  fieldLabel: string;
  placeholder: string;
  /** The project's home market, shown as the "inherit" option's label so the
   * default isn't an unexplained blank. */
  defaultCountry: string;
  /** The project's existing categories, for the Category dropdown. Omitted
   * (or empty) pages don't get a Category field at all — perception prompts
   * currently don't use this axis. */
  topics?: Topic[];
};

/** Collapsed button that expands into a composer. Shared by the Prompts and
 * Perception pages — they differ only in copy and prompt_type.
 *
 * Category is manual, chosen right here at creation — like Peec, never
 * guessed by a classifier (see lib/actions/prompts.ts's resolveTopic). Pick
 * an existing one from the dropdown, or "+ Add new category" to type one in;
 * leaving it on "Uncategorized" is a real, honest state too, not an error. */
export function PromptComposer({
  promptType,
  toggleLabel,
  fieldLabel,
  placeholder,
  defaultCountry,
  topics = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [categorySelect, setCategorySelect] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const addingNewCategory = categorySelect === NEW_CATEGORY;

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
                formData.set(
                  "category",
                  addingNewCategory
                    ? newCategoryName.trim()
                      ? `new:${newCategoryName.trim()}`
                      : ""
                    : categorySelect
                      ? `id:${categorySelect}`
                      : "",
                );
                await addPrompt(formData);
                formRef.current?.reset();
                setCategorySelect("");
                setNewCategoryName("");
                setOpen(false);
              })
            }
            className="grid grid-cols-1 items-end gap-5 sm:grid-cols-[1fr_190px_auto]"
          >
            <div>
              <label
                htmlFor="prompt-query-text"
                className="font-sans text-[11px] font-semibold tracking-[0.06em] text-[var(--muted-2)] uppercase"
              >
                {fieldLabel}
              </label>
              <input
                id="prompt-query-text"
                name="query_text"
                required
                placeholder={placeholder}
                className="mt-2.5 w-full rounded-[10px] border border-[var(--rule)] bg-[var(--muted)] px-3.5 py-3 font-sans text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--ember)]"
              />
            </div>

            <div>
              <label
                htmlFor="prompt-category"
                className="font-sans text-[11px] font-semibold tracking-[0.06em] text-[var(--muted-2)] uppercase"
              >
                Category
              </label>
              <select
                id="prompt-category"
                value={categorySelect}
                onChange={(e) => setCategorySelect(e.target.value)}
                className="mt-2.5 w-full rounded-[10px] border border-[var(--rule)] bg-[var(--muted)] px-3.5 py-3 font-sans text-[14px] text-[var(--ink)] outline-none focus:border-[var(--ember)]"
              >
                <option value="">Uncategorized</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value={NEW_CATEGORY}>+ Add new category…</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="rounded-full bg-[var(--ember)] px-5 py-3 font-sans text-[12.5px] font-semibold text-white transition-opacity duration-150 disabled:opacity-60"
            >
              {isPending ? "Adding…" : "Track prompt"}
            </button>
          </form>

          {addingNewCategory && (
            <div className="mt-4">
              <label
                htmlFor="prompt-new-category"
                className="font-sans text-[11px] font-semibold tracking-[0.06em] text-[var(--muted-2)] uppercase"
              >
                New category name
              </label>
              <input
                id="prompt-new-category"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Hair Oil"
                className="mt-2.5 w-full max-w-[320px] rounded-[10px] border border-[var(--rule)] bg-[var(--muted)] px-3.5 py-2.5 font-sans text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--ember)]"
              />
            </div>
          )}

          <p className="mt-3.5 font-serif text-[13px] text-[var(--muted-2)] italic">
            Fetched from {countryName(defaultCountry)}, this project&rsquo;s home
            market. The market is sent to the engine with the prompt — it steers
            which country&rsquo;s sources, retailers and pricing the answer is
            built from. Category is manual, chosen here — nothing guesses it for you.
          </p>
        </section>
      )}
    </>
  );
}
