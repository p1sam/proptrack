import { parseTradeFilters } from "@/lib/filters";
import { describeFilters } from "@/server/queries/reports";
import { attachment, authorizeExport, exportError, MIME } from "@/server/reports/http";
import { isMonthKey } from "@/server/reports/aggregations";
import { buildMonthlyReport, defaultReportMonth } from "@/server/reports/monthly";
import { renderMonthlyPdf } from "@/server/reports/monthly-pdf";

/** GET /api/export/monthly?month=YYYY-MM&<trade filters> — monthly performance report (PDF). */
export async function GET(req: Request) {
  const auth = await authorizeExport(req);
  if ("response" in auth) return auth.response;
  const params = new URL(req.url).searchParams;
  const m = params.get("month");
  if (m && !isMonthKey(m)) return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  try {
    const month = m ?? (await defaultReportMonth(auth.user.id));
    const filters = parseTradeFilters(params);
    const [report, note] = await Promise.all([buildMonthlyReport(auth.user.id, month, filters), describeFilters(auth.user.id, filters, { ignoreRange: true })]);
    const pdf = await renderMonthlyPdf(report, note);
    return attachment(new Uint8Array(pdf), `proptrack-monthly-${month}.pdf`, MIME.pdf);
  } catch (e) {
    return exportError(e, "monthly report");
  }
}
