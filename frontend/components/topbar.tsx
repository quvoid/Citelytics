export function Topbar() {
  return (
    <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border bg-card px-5 py-2.5">
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 font-medium hover:border-[#d3d3da]">
        <span className="flex h-4 w-4 items-center justify-center rounded bg-[#157f53] font-mono text-[9px] text-white">
          CL
        </span>
        Citelytics Demo <span className="text-[10px] text-[#a2a2ac]">▾</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[#3f3f48]">
        <span className="opacity-60">▦</span>All time <span className="text-[10px] text-[#a2a2ac]">▾</span>
      </div>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <div className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#4740c9] font-mono text-[9px] font-medium text-white">
          G
        </span>
        Gemini
      </div>
      <div className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0f766e] font-mono text-[9px] font-medium text-white">
          OR
        </span>
        OpenRouter
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <div className="font-mono text-[11.5px] text-muted-foreground">
          demo · manual fetch only
        </div>
      </div>
    </div>
  );
}
