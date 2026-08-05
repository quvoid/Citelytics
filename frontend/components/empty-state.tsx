export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div
        className="h-[140px] w-[140px] rounded-[var(--radius-xl)] bg-[var(--tint-lavender)] bg-cover bg-center"
        style={{ backgroundImage: "url(/images/empty-state.webp)" }}
        role="img"
        aria-label=""
      />
      <div>
        <div className="font-sans text-[14.5px] font-semibold text-[var(--ink)]">{title}</div>
        <p className="mx-auto mt-1 max-w-[36ch] font-sans text-[13px] text-[var(--muted-2)]">{body}</p>
      </div>
    </div>
  );
}
