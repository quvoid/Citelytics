"use client";

import { LineChart } from "@tremor/react";

export function VisibilityChart({
  data,
}: {
  data: { date: string; citations: number }[];
}) {
  return (
    <LineChart
      className="h-72"
      data={data}
      index="date"
      categories={["citations"]}
      colors={["blue"]}
      showLegend={false}
      showAnimation
    />
  );
}
