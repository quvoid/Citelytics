import Link from "next/link";
import { NewBriefForm } from "@/components/new-brief-form";

export const dynamic = "force-dynamic";

export default function NewBriefPage() {
  return (
    <div className="mx-auto max-w-[640px]">
      <section className="py-14">
        <Link
          href="/briefs"
          className="font-sans text-[11px] tracking-[0.11em] text-[var(--rust)] uppercase no-underline"
        >
          ← all briefs
        </Link>
        <h1 className="mt-6 font-serif text-[42px] leading-[1.12] font-normal tracking-[-0.02em]">
          New brief
        </h1>
        <p className="mt-4 max-w-[54ch] font-serif text-[17px] leading-[1.55] text-[var(--muted-2)]">
          Type the prompt or topic you want a writing brief for. Citelytics proposes tone, intent,
          article type and a takeaway set once you run the analysis.
        </p>
        <NewBriefForm />
      </section>
    </div>
  );
}
