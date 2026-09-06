import {
  ArrowUpRight,
  CircleDollarSign,
  FileText,
  Gauge,
  Layers,
  Link2,
  ListChecks,
  MessagesSquare,
  Search,
  Sparkles,
  SplitSquareHorizontal,
  Target,
  type LucideIcon,
} from "lucide-react";

/** The app's category/section list — shared by every nav surface (the
 *  bottom-drawer nav now, sidebar-nav.tsx's left-rail version kept for
 *  reference) so there's exactly one place that defines "what are the
 *  app's sections", not one per nav surface drifting apart. */
export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/actions", label: "Actions", icon: ListChecks },
  { href: "/prompts", label: "Prompts", icon: Search },
  { href: "/chats", label: "Chats", icon: MessagesSquare },
  { href: "/briefs", label: "Briefs", icon: FileText },
  { href: "/fanouts", label: "Fanouts", icon: SplitSquareHorizontal },
  { href: "/sources", label: "Sources", icon: Link2 },
  { href: "/sources/gap-analysis", label: "Gap Analysis", icon: Target },
  { href: "/brands", label: "Brands", icon: Layers },
  { href: "/perception", label: "Perception", icon: ArrowUpRight },
  { href: "/engine-costs", label: "Engine Costs", icon: CircleDollarSign },
];

/** Same "is this link active" rule every nav surface needs — prompts/briefs
 *  match their whole `/id` subtree, not just the exact list path. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return (
    pathname === href ||
    (href === "/prompts" && pathname.startsWith("/prompts/")) ||
    (href === "/briefs" && pathname.startsWith("/briefs/"))
  );
}
