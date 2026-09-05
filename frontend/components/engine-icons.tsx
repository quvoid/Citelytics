// Simplified, stylized marks representing each engine — not exact trademarked
// logo files, but recognizable at a glance next to the engine name.

function GeminiIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="gemini-grad" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="50%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C12 7.5228 16.4772 12 22 12C16.4772 12 12 16.4772 12 22C12 16.4772 7.52285 12 2 12C7.52285 12 12 7.5228 12 2Z"
        fill="url(#gemini-grad)"
      />
    </svg>
  );
}

function ChatGPTIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22.28 9.82a5.99 5.99 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6 6 0 0 0 4.98 4.18a5.99 5.99 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.09 5.99 5.99 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A6 6 0 0 0 19.02 19.8a5.99 5.99 0 0 0 4-2.89 6.05 6.05 0 0 0-.74-7.09ZM13.51 21a4.48 4.48 0 0 1-2.87-1.04l.14-.08 4.77-2.75a.78.78 0 0 0 .39-.68v-6.71l2.02 1.17a.07.07 0 0 1 .04.06v5.56A4.5 4.5 0 0 1 13.51 21ZM3.9 17.15a4.47 4.47 0 0 1-.54-3.02l.14.08 4.77 2.75a.77.77 0 0 0 .78 0l5.83-3.36v2.33a.08.08 0 0 1-.03.07l-4.82 2.78a4.5 4.5 0 0 1-6.13-1.63ZM2.66 7.8a4.47 4.47 0 0 1 2.35-1.96v5.66a.76.76 0 0 0 .39.67l5.82 3.36-2.02 1.17a.08.08 0 0 1-.07.01L3.7 13.93a4.5 4.5 0 0 1-1.04-6.13Zm16.58 3.87-5.83-3.37 2.02-1.16a.08.08 0 0 1 .08 0l4.81 2.78a4.5 4.5 0 0 1-.68 8.1v-5.67a.77.77 0 0 0-.4-.68ZM21.1 8.65l-.14-.09-4.77-2.76a.78.78 0 0 0-.78 0L9.58 9.16V6.83a.07.07 0 0 1 .03-.07l4.82-2.77a4.5 4.5 0 0 1 6.68 4.66ZM8.44 12.87l-2.02-1.17a.08.08 0 0 1-.04-.06V6.08a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.77 2.75a.78.78 0 0 0-.39.68l-.02 6.73Zm1.1-2.36 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5v-3Z"
        fill="#10A37F"
      />
    </svg>
  );
}

function engineDisplayName(name: string | undefined): string {
  if (name === "gemini") return "Gemini";
  if (name === "openrouter") return "ChatGPT";
  return name ?? "—";
}

function EngineIcon({ name, size }: { name: string | undefined; size?: number }) {
  if (name === "gemini") return <GeminiIcon size={size} />;
  if (name === "openrouter") return <ChatGPTIcon size={size} />;
  return null;
}

export function EngineLabel({ name, size = 14 }: { name: string | undefined; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <EngineIcon name={name} size={size} />
      {engineDisplayName(name)}
    </span>
  );
}
