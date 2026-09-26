import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Plain table alternative for a chart: one row per bar, pre-formatted cells. */
export function BucketTable({ columns, rows, caption, maxHeight }: { columns: { label: string; align?: "left" | "right" }[]; rows: { key: string; cells: React.ReactNode[] }[]; caption: string; maxHeight?: number }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No data.</p>;
  return (
    <div className="overflow-y-auto" style={maxHeight ? { maxHeight } : undefined}>
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            {columns.map((c, i) => (
              <TableHead key={i} className={c.align === "left" || (!c.align && i === 0) ? undefined : "text-right"}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              {r.cells.map((c, i) => (
                <TableCell key={i} className={columns[i]?.align === "left" || (!columns[i]?.align && i === 0) ? "font-medium" : "text-right tabular"}>
                  {c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
