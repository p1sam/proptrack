import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectFileAdapter } from "@/lib/import/adapters";
import { parseCsv } from "@/lib/import/csv";
import { validateMapping } from "@/lib/import/fields";
import { summarize } from "@/lib/import/normalize";
import { importTradesSchema, toWireTrade } from "@/lib/import/schema";

const text = readFileSync(join(__dirname, "../../public/templates/trades-template.csv"), "utf8");

describe("sample CSV template", () => {
  const table = parseCsv(text);
  const adapter = detectFileAdapter(table.headers);
  const mapping = adapter.suggestMapping(table.headers, table.rows);
  const rows = adapter.parse({ table, mapping, options: { timeZone: "UTC", dateFormat: "auto", decimal: ".", profitIsNet: false } });

  it("auto-maps every column with the generic adapter", () => {
    expect(adapter.id).toBe("generic-csv");
    expect(validateMapping(mapping).errors).toEqual([]);
    expect(Object.values(mapping).filter((v) => v !== null)).toHaveLength(table.headers.length);
  });

  it("normalizes every row without errors", () => {
    expect(summarize(rows)).toMatchObject({ total: 3, error: 0, skipped: 0 });
    const t = rows[1].trade!;
    expect(t).toMatchObject({ symbol: "XAUUSD", direction: "SHORT", quantity: 0.5, commission: 3.5, grossPnl: -325, externalId: "100002" });
    expect(t.openedAt.toISOString()).toBe("2024-03-15T14:02:10.000Z");
  });

  it("produces rows the import action accepts", () => {
    const parsed = importTradesSchema.safeParse({
      accountId: "00000000-0000-4000-8000-000000000000",
      source: adapter.id,
      rows: rows.map((r) => toWireTrade(r.trade!)),
    });
    expect(parsed.success).toBe(true);
  });
});
