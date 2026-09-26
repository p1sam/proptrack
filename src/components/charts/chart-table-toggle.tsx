"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Switch between a chart and its accessible table alternative. Both are rendered on the server and
 * passed in; only the visible one is mounted.
 */
export function ChartTableToggle({ chart, table, label = "View", defaultView = "chart" }: { chart: React.ReactNode; table: React.ReactNode; label?: string; defaultView?: "chart" | "table" }) {
  const [view, setView] = useState<"chart" | "table">(defaultView);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <ToggleGroup type="single" size="sm" variant="outline" value={view} onValueChange={(v) => v && setView(v as "chart" | "table")} aria-label={`${label}: chart or table`}>
          <ToggleGroupItem value="chart" aria-label="Chart">
            <BarChart3 />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table">
            <Table2 />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === "chart" ? chart : table}
    </div>
  );
}
