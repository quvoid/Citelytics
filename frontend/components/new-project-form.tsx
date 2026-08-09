"use client";

import { useTransition } from "react";
import { createProject } from "@/lib/actions/projects";
import { COUNTRIES } from "@/lib/countries";

export function NewProjectForm() {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => createProject(formData))}
      className="mt-11"
    >
      <div>
        <label className="text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
          Brand name
        </label>
        <input
          name="name"
          required
          placeholder="Parachute Advansed"
          className="mt-3 w-full border-0 border-b border-[var(--ink)] bg-transparent py-1.5 font-serif text-[30px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
        />
      </div>
      <div className="mt-9">
        <label className="text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
          Primary domain
        </label>
        <input
          name="domain"
          required
          placeholder="marico.com"
          className="mt-3 w-full border-0 border-b border-[var(--ink)] bg-transparent py-1.5 font-serif text-[30px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
        />
      </div>

      <div className="mt-9">
        <label
          htmlFor="project-default-country"
          className="text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase"
        >
          Home market
        </label>
        <select
          id="project-default-country"
          name="default_country"
          defaultValue="IN"
          className="mt-3 w-full border-0 border-b border-[var(--ink)] bg-transparent py-2.5 font-serif text-[30px] text-[var(--ink)] outline-none"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-2.5 font-serif text-[13px] text-[var(--faint)] italic">
          Every prompt inherits this unless it sets its own — change a single
          prompt&rsquo;s market from the Prompts table.
        </p>
      </div>

      <div className="mt-11 grid grid-cols-2 gap-px border border-[var(--rule)] bg-[var(--rule)]">
        <div className="bg-[var(--paper)] px-5 py-4.5">
          <div className="text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
            Engines
          </div>
          <div className="mt-2 font-serif text-[17px]">Gemini &amp; ChatGPT</div>
        </div>
        <div className="bg-[var(--paper)] px-5 py-4.5">
          <div className="text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
            Starting prompts
          </div>
          <div className="mt-2 font-serif text-[17px]">None yet — add from the Prompts page</div>
        </div>
      </div>

      <div className="mt-9 flex items-center gap-5">
        <button
          type="submit"
          disabled={isPending}
          className="border border-[var(--rust)] bg-[var(--rust)] px-6 py-3 font-sans text-xs tracking-[0.06em] text-[var(--paper)] uppercase disabled:opacity-60"
        >
          {isPending ? "Starting…" : "Start tracking"}
        </button>
        <span className="flex items-center gap-1.5 font-serif text-[13px] text-[var(--faint)] italic">
          <span className="h-[7px] w-[7px] rounded-full border border-[var(--faint)]" />
          no data until the first fetch runs
        </span>
      </div>
    </form>
  );
}
