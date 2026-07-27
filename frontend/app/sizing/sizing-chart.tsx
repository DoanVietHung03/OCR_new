"use client";

import { useEffect, useRef } from "react";
import type { SizingJob } from "../../lib/api";

export default function SizingChart({ jobs }: { jobs: SizingJob[] }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current || jobs.length < 2) return;
    let chart: { dispose(): void; resize(): void; setOption(option: object): void } | undefined;
    const resize = () => chart?.resize();
    Promise.all([
      import("echarts/core"), import("echarts/charts"),
      import("echarts/components"), import("echarts/renderers"),
    ]).then(([core, charts, components, renderers]) => {
      if (!host.current) return;
      core.use([
        charts.BarChart, charts.LineChart, charts.ScatterChart,
        components.GridComponent, components.TooltipComponent,
        components.LegendComponent, components.DataZoomComponent,
        components.AriaComponent, components.ToolboxComponent, renderers.SVGRenderer,
      ]);
      chart = core.init(host.current, undefined, { renderer: "svg" });
      chart.setOption({
        aria: { enabled: true },
        tooltip: { trigger: "axis" }, legend: {}, toolbox: { feature: { saveAsImage: { type: "png" } } }, grid: { left: 55, right: 20, bottom: 70 },
        dataZoom: [{ type: "inside" }, { type: "slider" }],
        xAxis: { type: "category", data: jobs.map((job) => job.job_id.slice(0, 8)) },
        yAxis: { type: "value", name: "Tokens" },
        series: [
          { name: "Prompt", type: "bar", stack: "tokens", data: jobs.map((job) => Number(job.prompt_tokens || 0)) },
          { name: "Completion", type: "bar", stack: "tokens", data: jobs.map((job) => Number(job.completion_tokens || 0)) },
          ...(jobs.length >= 5 ? [
            { name: "Total trend", type: "line", data: jobs.map((job) => Number(job.total_tokens || 0)) },
            { name: "Tokens / attempts", type: "scatter", data: jobs.map((job) => [Number(job.operation_count || 0), Number(job.total_tokens || 0)]) },
          ] : []),
          ...(jobs.length >= 20 ? [{ name: "Token distribution", type: "bar", data: [...jobs].sort((a, b) => a.total_tokens - b.total_tokens).map((job) => job.total_tokens) }] : []),
        ],
      });
      window.addEventListener("resize", resize);
    });
    return () => { window.removeEventListener("resize", resize); chart?.dispose(); };
  }, [jobs]);
  return jobs.length >= 2 ? <div ref={host} className="sizing-chart" role="img" aria-label="Prompt and completion tokens by job" /> : null;
}
