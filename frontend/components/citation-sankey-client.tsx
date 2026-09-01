"use client";

import dynamic from "next/dynamic";
import type { SankeyLink, SankeyNode } from "./citation-sankey";

/** ECharts draws to a canvas and touches `window` on mount, so the chart must
 * not be prerendered. `ssr: false` is only honoured inside a Client Component
 * — hence this wrapper rather than calling `dynamic` from the Sources page,
 * which is a Server Component. */
const CitationSankey = dynamic(
  () => import("./citation-sankey").then((m) => m.CitationSankey),
  {
    ssr: false,
    /* Reserve the chart's height so the page doesn't jump when it mounts. */
    loading: () => <div style={{ height: 460 }} aria-hidden="true" />,
  }
);

export function CitationSankeyClient(props: {
  nodes: SankeyNode[];
  links: SankeyLink[];
  height?: number;
}) {
  return <CitationSankey {...props} />;
}
