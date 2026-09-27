import type { AdapterSummary } from "@/lib/import/adapters";
import { Badge } from "@/components/ui/badge";

/** Every trade source in the registry; unimplemented ones are labelled "Coming later". */
export function SourceList({ sources }: { sources: AdapterSummary[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {sources.map((s) => (
        <li key={s.id} className="flex flex-col gap-1 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{s.label}</span>
            {s.status === "available" ? (
              <Badge variant="outline" className="text-profit">
                Available
              </Badge>
            ) : (
              <Badge variant="secondary">Coming later</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{s.description}</p>
          <p className="mt-auto text-[11px] text-muted-foreground">{s.kind === "api" ? "Platform connection" : `File · ${s.formats.join(", ")}`}</p>
        </li>
      ))}
    </ul>
  );
}
