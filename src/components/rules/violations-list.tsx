import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export interface ViolationRowDTO {
  id: string;
  source: "PROP_RULE" | "PERSONAL_RULE";
  severity: "WARNING" | "BREACH";
  ruleLabel: string;
  day: string;
  occurredAt: string;
  message: string;
  tradeId: string | null;
  symbol: string | null;
  accountId: string;
  accountName: string;
  hardLimit: boolean;
}

export function ViolationsList({ rows, timezone }: { rows: ViolationRowDTO[]; timezone: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No violations in this range. Nice.</p>;
  return (
    <ul className="-my-2 divide-y text-sm">
      {rows.map((v) => (
        <li key={v.id} className="flex items-start gap-2.5 py-2">
          <ShieldAlert className={v.severity === "BREACH" ? "mt-0.5 size-4 shrink-0 text-loss" : "mt-0.5 size-4 shrink-0 text-warning"} aria-label={v.severity === "BREACH" ? "Breach" : "Warning"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{v.ruleLabel}</span>
              <span className="text-xs text-muted-foreground">{v.source === "PROP_RULE" ? "Prop-firm rule" : "Your rule"}{v.severity === "BREACH" ? " · breach" : ""}</span>
            </div>
            <div className="text-muted-foreground">{v.message}</div>
            <div className="text-xs text-muted-foreground">
              {formatDateTime(v.occurredAt, timezone)} ·{" "}
              <Link href={`/accounts/${v.accountId}`} className="hover:text-foreground hover:underline">
                {v.accountName}
              </Link>
              {v.tradeId && (
                <>
                  {" · "}
                  <Link href={`/trades/${v.tradeId}`} className="hover:text-foreground hover:underline">
                    {v.symbol ?? "trade"}
                  </Link>
                </>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
