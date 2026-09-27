import { parseTradeFilters } from "@/lib/filters";
import { describeFilters } from "@/server/queries/reports";
import { attachment, authorizeExport, exportError, MIME, stamp } from "@/server/reports/http";
import { buildPropFirmReport, propFirmCsv } from "@/server/reports/prop-firms";
import { renderPropFirmPdf } from "@/server/reports/prop-firms-pdf";

/** GET /api/export/prop-firms?format=pdf|csv&accounts=…&firms=… — prop-firm economics report. */
export async function GET(req: Request) {
  const auth = await authorizeExport(req);
  if ("response" in auth) return auth.response;
  const params = new URL(req.url).searchParams;
  const format = params.get("format") ?? "pdf";
  if (format !== "pdf" && format !== "csv") return Response.json({ error: "format must be pdf or csv" }, { status: 400 });
  try {
    const filters = parseTradeFilters(params);
    const report = await buildPropFirmReport(auth.user.id, filters);
    const name = `proptrack-prop-firms-${stamp()}.${format}`;
    if (format === "csv") return attachment(propFirmCsv(report), name, MIME.csv);
    const note = await describeFilters(auth.user.id, { ...filters }, { only: ["accounts", "firms"] });
    return attachment(new Uint8Array(await renderPropFirmPdf(report, note)), name, MIME.pdf);
  } catch (e) {
    return exportError(e, "prop-firm report");
  }
}
