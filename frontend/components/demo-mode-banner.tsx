export function DemoModeBanner() {
  return (
    <div className="flex items-center gap-4 rounded-[10px] bg-[#1b1b21] px-3.5 py-3 text-white">
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-[#2e2e38] text-[#a5a0f5]">
        ⌘
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">Demo mode — mixed real and simulated data</div>
        <div className="mt-0.5 text-xs text-[#a4a4b0]">
          <span className="font-medium text-white">Gemini</span> citations are real
          (Google Search grounding). <span className="font-medium text-white">OpenRouter (demo)</span>{" "}
          citations are simulated for UI purposes unless web search is explicitly
          enabled — look for the &ldquo;Simulated&rdquo; badge.
        </div>
      </div>
    </div>
  );
}
