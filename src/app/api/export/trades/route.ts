import { parseTradeFilters } from "@/lib/filters";
import { attachment, authorizeExport, exportError, MIME, stamp } from "@/server/reports/http";
import { loadTradeExport, tradesCsv, tradesXlsx } from "@/server/reports/trades";

/** GET /api/export/trades?format=csv|xlsx&<trade filters> — every matching trade copy. */
export async function GET(req: Request) {
  const auth = await authorizeExport(req);
  if ("response" in auth) return auth.response;
  const params = new URL(req.url).searchParams;
  const format = params.get("format") ?? "csv";
  if (format !== "csv" && format !== "xlsx") return Response.json({ error: "format must be csv or xlsx" }, { status: 400 });
  try {
    const data = await loadTradeExport(auth.user.id, parseTradeFilters(params));
    const name = `proptrack-trades-${stamp()}.${format}`;
    if (format === "csv") return attachment(tradesCsv(data), name, MIME.csv);
    return attachment(new Uint8Array(await tradesXlsx(data)), name, MIME.xlsx);
  } catch (e) {
    return exportError(e, "trade report");
  }
}
