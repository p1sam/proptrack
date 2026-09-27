import { cn } from "@/lib/utils";

/** A report type: what it contains, what scopes it, a preview of its key numbers and downloads. */
export function ReportCard({
  icon,
  title,
  description,
  scope,
  preview,
  actions,
  footnote,
  headerExtra,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  scope: string;
  preview: React.ReactNode;
  actions: React.ReactNode;
  footnote?: string;
  headerExtra?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-lg border bg-card", className)} aria-labelledby={`report-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <div className="flex flex-col gap-3 border-b px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">{icon}</div>
          <div className="min-w-0">
            <h2 id={`report-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="text-sm font-semibold">
              {title}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        {headerExtra}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-[11px] font-medium text-muted-foreground uppercase">Preview</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{preview}</dl>
        <p className="text-xs text-muted-foreground">{scope}</p>
      </div>
      <div className="flex flex-col gap-2 border-t px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
        {footnote && <p className="text-[11px] text-muted-foreground">{footnote}</p>}
      </div>
    </section>
  );
}

export function PreviewStat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular">{value}</dd>
      {sub && <dd className="truncate text-[11px] text-muted-foreground tabular">{sub}</dd>}
    </div>
  );
}
