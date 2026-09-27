import { ACCEPTED_EXTENSIONS } from "../csv";
import { autoMap, FIELD_META, IMPORT_FIELDS } from "../fields";
import { normalizeRows } from "../normalize";
import type { AvailableFileAdapter } from "./types";

/** Any CSV: columns are auto-mapped from the header alias table and adjustable by the user. */
export const genericCsvAdapter: AvailableFileAdapter = {
  id: "generic-csv",
  label: "Generic CSV",
  description: "Any spreadsheet or platform export saved as CSV. Columns are matched automatically and you can adjust the mapping.",
  formats: ["CSV", "TSV", "TXT"],
  kind: "file",
  status: "available",
  accept: ACCEPTED_EXTENSIONS,
  detect(headers) {
    const m = autoMap(headers);
    const required = IMPORT_FIELDS.filter((f) => FIELD_META[f].required);
    return (required.filter((f) => m[f] !== null).length / required.length) * 0.5;
  },
  suggestMapping: autoMap,
  defaults: {},
  parse: ({ table, mapping, options }) => normalizeRows(table.rows, mapping, options),
};
