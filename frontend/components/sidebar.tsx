import { SidebarNav } from "@/components/sidebar-nav";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { logoDomains } from "@/lib/logo-domains";
import type { LayoutData } from "@/lib/layout-data";

export function Sidebar({ data }: { data: LayoutData }) {
  const { current, projects, promptCount, brandCount, briefCount } = data;

  return (
    <aside
      className="sticky top-0 flex h-screen w-[248px] flex-none flex-col bg-cover bg-center bg-[var(--sb-bg)]"
      style={{ backgroundImage: "url(/images/sidebar-texture.webp)" }}
    >
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] bg-[var(--ember)] text-[13px] font-bold text-white">
          C
        </span>
        <span className="font-sans text-[17px] leading-none font-bold tracking-[-0.01em] text-white">
          Citelytics
        </span>
      </div>
      <div className="px-4 pb-4">
        <WorkspaceSwitcher current={current} projects={projects} logoDomains={[...logoDomains()]} />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-4">
        <div className="px-3 pb-2 font-sans text-[11px] font-semibold tracking-[0.08em] text-[var(--sb-text)] uppercase">
          Workspace
        </div>
        <SidebarNav promptCount={promptCount} brandCount={brandCount} briefCount={briefCount} />
      </div>
    </aside>
  );
}
