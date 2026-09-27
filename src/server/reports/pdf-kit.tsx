import "server-only";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { ReactNode } from "react";

/**
 * Minimal typographic kit for server-rendered PDF reports (@react-pdf/renderer, built-in
 * Helvetica). The built-in fonts use WinAnsi encoding, so `pdfText` maps the few non-Latin-1
 * glyphs our formatters emit (U+2212 minus, ≤, ≥) to ASCII equivalents.
 */

// Never hyphenate: account names and statuses read better wrapped at spaces.
Font.registerHyphenationCallback((word) => [word]);

export function pdfText(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  return String(s).replace(/−/g, "-").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/×/g, "x");
}

const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#e5e7eb";
export const PROFIT = "#15803d";
export const LOSS = "#b91c1c";

export const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 48, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9, color: INK, lineHeight: 1.35 },
  header: { position: "absolute", top: 18, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 6 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", lineHeight: 1.2, marginBottom: 4 },
  subtitle: { fontSize: 10, color: MUTED, marginBottom: 14 },
  h2: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  small: { fontSize: 7.5, color: MUTED },
  para: { marginBottom: 4 },
  kpis: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  kpi: { width: "25%", paddingHorizontal: 4, marginBottom: 8 },
  kpiBox: { borderWidth: 0.5, borderColor: RULE, borderRadius: 3, paddingVertical: 6, paddingHorizontal: 8 },
  kpiLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 12.5, fontFamily: "Helvetica-Bold", marginTop: 2 },
  kpiSub: { fontSize: 7, color: MUTED, marginTop: 1 },
  table: { borderTopWidth: 0.75, borderTopColor: INK },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 3.2 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: MUTED },
  td: { fontSize: 8.5 },
  total: { fontFamily: "Helvetica-Bold" },
});

export function toneColor(v: number | null | undefined) {
  if (v === null || v === undefined || v === 0) return INK;
  return v > 0 ? PROFIT : LOSS;
}

export function ReportDocument({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <Document title={title} author="PropTrack" creator="PropTrack" producer="PropTrack">
      <Page size="A4" style={s.page} wrap>
        <View style={s.header} fixed>
          <Text>PropTrack · {pdfText(title)}</Text>
          <Text>{pdfText(meta)}</Text>
        </View>
        {children}
        <View style={s.footer} fixed>
          <Text>{pdfText(meta)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  tone?: number | null;
}

export function KpiGrid({ items }: { items: Kpi[] }) {
  return (
    <View style={s.kpis}>
      {items.map((k) => (
        <View key={k.label} style={s.kpi} wrap={false}>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>{pdfText(k.label)}</Text>
            <Text style={[s.kpiValue, { color: toneColor(k.tone) }]}>{pdfText(k.value)}</Text>
            {k.sub ? <Text style={s.kpiSub}>{pdfText(k.sub)}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export interface Col {
  label: string;
  flex?: number;
  align?: "left" | "right";
}

export type Cell = string | { text: string; tone?: number | null; bold?: boolean };

export function Table({ cols, rows, total, empty = "No data." }: { cols: Col[]; rows: Cell[][]; total?: Cell[]; empty?: string }) {
  const cell = (c: Cell, i: number, extra: Style = {}) => {
    const col = cols[i];
    const obj = typeof c === "string" ? { text: c } : c;
    return (
      <Text
        key={i}
        style={[
          s.td,
          { flex: col.flex ?? 1, textAlign: col.align ?? "left", paddingRight: i === cols.length - 1 ? 0 : 6 },
          obj.tone !== undefined ? { color: toneColor(obj.tone) } : {},
          obj.bold ? s.total : {},
          extra,
        ]}
      >
        {pdfText(obj.text)}
      </Text>
    );
  };
  return (
    <View style={s.table}>
      <View style={s.tr} wrap={false}>
        {cols.map((c, i) => (
          <Text key={c.label} style={[s.th, { flex: c.flex ?? 1, textAlign: c.align ?? "left", paddingRight: i === cols.length - 1 ? 0 : 6 }]}>
            {pdfText(c.label)}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <View style={s.tr}>
          <Text style={[s.td, { color: MUTED }]}>{empty}</Text>
        </View>
      ) : (
        rows.map((r, ri) => (
          <View key={ri} style={s.tr} wrap={false}>
            {r.map((c, i) => cell(c, i))}
          </View>
        ))
      )}
      {total ? (
        <View style={[s.tr, { borderBottomWidth: 0.75, borderBottomColor: INK }]} wrap={false}>
          {total.map((c, i) => cell(c, i, s.total))}
        </View>
      ) : null}
    </View>
  );
}

export function H2({ children }: { children: string }) {
  return (
    <Text style={s.h2} minPresenceAhead={60}>
      {pdfText(children)}
    </Text>
  );
}

export function Note({ children }: { children: string }) {
  return <Text style={[s.small, s.para]}>{pdfText(children)}</Text>;
}
