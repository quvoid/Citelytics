import Link from "next/link";
import { NewProjectForm } from "@/components/new-project-form";
import { getCurrentProjectId } from "@/lib/current-project";
import { getProjects } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const [projectId, projects] = await Promise.all([getCurrentProjectId(), getProjects()]);
  const current = projects.find((p) => p.id === projectId);

  return (
    <div className="mx-auto max-w-[640px] py-8">
      <div
        className="h-[140px] rounded-[var(--radius-xl)] bg-cover bg-center"
        style={{
          backgroundImage: "url(/images/onboarding-header.webp)",
          backgroundColor: "var(--tint-peach)",
        }}
      />
      <section className="pt-8">
        <Link
          href="/"
          className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[var(--ember)] uppercase no-underline"
        >
          ← back to {current?.name ?? "overview"}
        </Link>
        <h1 className="mt-4 font-sans text-[32px] leading-[1.15] font-bold tracking-[-0.015em]">
          Track a new brand
        </h1>
        <p className="mt-3 max-w-[47ch] font-sans text-[15px] leading-[1.55] text-[var(--muted-2)]">
          Each brand gets its own workspace — its own prompts, sources and competitor set. It
          starts empty; add prompts and tracked URLs once it&apos;s created, then run a fetch.
        </p>
        <NewProjectForm />
      </section>
    </div>
  );
}
