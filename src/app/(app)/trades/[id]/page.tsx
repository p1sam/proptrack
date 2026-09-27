import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, ShieldAlert } from "lucide-react";
import { requireUser } from "@/server/session";
import { getPrefs } from "@/server/queries/accounts";
import { getFilterOptions } from "@/server/queries/options";
import { getTradeDetail } from "@/server/queries/trades";
import { calculateGrossPnl, calculateStopDistance } from "@/lib/calc/trade";
import { formatDateTime, formatDuration, formatMoney, formatNumber, formatPct, formatR, formatRatio, humanize } from "@/lib/format";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Pnl, RValue } from "@/components/app/pnl";
import { Button } from "@/components/ui/button";
import { DirectionBadge, OpenBadge } from "@/components/trades/badges";
import { DeleteTradeButton } from "@/components/trades/delete-trade-button";
import { JournalEditor } from "@/components/trades/journal-editor";
import { journalFromData } from "@/components/trades/journal-values";
import { gradeLabel } from "@/components/trades/labels";
import { ScreenshotGallery } from "@/components/trades/screenshot-gallery";
import { TagList } from "@/components/trades/tag-picker";

export async function generateMetadata(props: PageProps<"/trades/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const t = await getTradeDetail(user.id, id);
  return { title: t ? `${t.symbol} ${t.direction === "LONG" ? "long" : "short"}` : "Trade" };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular">{children}</dd>
    </>
  );
}

const px = (n: number | null) => (n === null ? "—" : formatNumber(n, 8));

export default async function TradeDetailPage(props: PageProps<"/trades/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const [t, prefs, options] = await Promise.all([getTradeDetail(user.id, id), getPrefs(user.id), getFilterOptions(user.id)]);
  if (!t) notFound();
  const tz = prefs.timezone;
  const ccy = t.account.currency;
  const duration = t.closedAt ? new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime() : null;
  const label = `${t.symbol} ${t.direction === "LONG" ? "long" : "short"} on ${t.account.name}`;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/trades" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> All trades
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t.symbol}
            <DirectionBadge direction={t.direction} />
            {t.status === "OPEN" && <OpenBadge />}
            {t.grade && <span className="rounded-md border px-1.5 py-0.5 text-[11px] font-medium">Grade {gradeLabel(t.grade)}</span>}
          </span>
        }
        description={
          <>
            <Link href={`/accounts/${t.account.id}`} className="hover:underline">
              {t.account.name}
            </Link>{" "}
            · opened {formatDateTime(t.openedAt, tz)}
            {t.closedAt && <> · closed {formatDateTime(t.closedAt, tz)}</>} · {humanize(t.source)}
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/trades/${t.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <DeleteTradeButton tradeId={t.id} label={label} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Net P&L" value={t.status === "OPEN" ? "Open" : <Pnl value={t.netPnl} currency={ccy} />} sub={t.grossPnl !== null ? `Gross ${formatMoney(t.grossPnl, ccy, { sign: true })}` : undefined} />
        <StatCard label="R multiple" value={<RValue value={t.rMultiple} />} sub={t.initialRisk === null ? "No valid stop" : undefined} />
        <StatCard label="Risk" value={t.initialRisk === null ? "—" : formatMoney(t.initialRisk, ccy)} sub={t.riskPercent !== null ? `${formatPct(t.riskPercent)} of balance` : undefined} />
        <StatCard label="Planned R:R" value={t.plannedRR === null ? "—" : `1 : ${formatRatio(t.plannedRR)}`} />
        <StatCard label="MFE / MAE" value={<span className="text-base">{formatR(t.mfeR)} / {formatR(t.maeR)}</span>} sub={t.mfePrice === null && t.maePrice === null ? "Not recorded" : undefined} />
        <StatCard label="Duration" value={duration === null ? "—" : formatDuration(duration)} sub={t.session?.name ?? "Outside sessions"} />
      </div>

      {t.copies.length > 0 && (
        <Section title="Linked copies" description="The same trade idea on other accounts. Trade statistics count the group once; money sums every copy.">
          <ul className="-my-2 divide-y text-sm">
            {t.copies.map((c) => (
              <li key={c.id}>
                <Link href={`/trades/${c.id}`} className="flex items-center gap-3 py-2 hover:underline">
                  <span className="flex-1 truncate">{c.account.name}</span>
                  <span className="text-xs text-muted-foreground tabular">qty {formatNumber(c.quantity, 4)}</span>
                  <RValue value={c.rMultiple} className="w-16 text-right" />
                  <span className="w-28 text-right">{c.status === "OPEN" ? <OpenBadge /> : <Pnl value={c.netPnl} currency={c.account.currency} />}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <Section title="Execution">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <Field label="Entry">{px(t.entryPrice)}</Field>
            <Field label="Average exit">{px(t.exitPrice)}</Field>
            <Field label="Stop loss">{px(t.stopLoss)}</Field>
            <Field label="Take profit">{px(t.takeProfit)}</Field>
            <Field label="Stop distance">{px(calculateStopDistance(t.entryPrice, t.stopLoss))}</Field>
            <Field label="Quantity">{formatNumber(t.quantity, 6)}</Field>
            <Field label="Point value">{formatNumber(t.pointValue, 8)}</Field>
            <Field label="MFE price">{px(t.mfePrice)}</Field>
            <Field label="MAE price">{px(t.maePrice)}</Field>
          </dl>
        </Section>
        <Section title="Money" description={`In ${ccy}`}>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <Field label="Gross P&L">
              <Pnl value={t.grossPnl} currency={ccy} />
            </Field>
            <Field label="Commission">{formatMoney(-t.commission, ccy)}</Field>
            <Field label="Swap">
              <Pnl value={t.swap} currency={ccy} />
            </Field>
            <Field label="Net P&L">
              <Pnl value={t.netPnl} currency={ccy} className="font-semibold" />
            </Field>
            <Field label="Platform gross P&L">{t.reportedGrossPnl === null ? "—" : formatMoney(t.reportedGrossPnl, ccy, { sign: true })}</Field>
            <Field label="Initial risk">{t.initialRisk === null ? "—" : `${formatMoney(t.initialRisk, ccy)}${t.riskAmountOverride !== null ? " (override)" : ""}`}</Field>
            <Field label="Risk % of balance">{formatPct(t.riskPercent)}</Field>
            <Field label="Balance before">{t.balanceBefore === null ? "—" : formatMoney(t.balanceBefore, ccy)}</Field>
            <Field label="Trading day">{t.tradingDay ?? "—"}</Field>
          </dl>
        </Section>
        <Section title="Classification">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <Field label="Strategy">{t.strategy?.name ?? "—"}</Field>
            <Field label="Session">{t.session?.name ?? "—"}</Field>
            <Field label="Setup">{t.setup ?? "—"}</Field>
            <Field label="Timeframe">{t.timeframe ?? "—"}</Field>
            <Field label="Trade type">{t.tradeType ?? "—"}</Field>
            <Field label="Entry model">{t.entryModel ?? "—"}</Field>
            <Field label="Market condition">{t.marketCondition ?? "—"}</Field>
            <Field label="Grade">{gradeLabel(t.grade)}</Field>
          </dl>
          {t.confluences.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {t.confluences.map((c) => (
                <span key={c} className="rounded border px-1.5 py-px text-[11px]">
                  {c}
                </span>
              ))}
            </div>
          )}
          {t.tags.length > 0 && <TagList tags={t.tags} className="mt-3" />}
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Exits" description={t.exits.length ? `${t.exits.length} leg${t.exits.length === 1 ? "" : "s"}` : undefined}>
          {t.exits.length ? (
            <div className="-mx-4 -my-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">Time</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Price</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Quantity</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Price P&amp;L</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {t.exits.map((e) => {
                    const legPnl = calculateGrossPnl({ direction: t.direction, entryPrice: t.entryPrice, exits: [e], pointValue: t.pointValue });
                    return (
                      <tr key={e.id}>
                        <td className="px-4 py-2 tabular text-muted-foreground">{formatDateTime(e.exitedAt, tz)}</td>
                        <td className="px-4 py-2 text-right tabular">{px(e.price)}</td>
                        <td className="px-4 py-2 text-right tabular">{formatNumber(e.quantity, 6)}</td>
                        <td className="px-4 py-2 text-right">
                          <Pnl value={legPnl} currency={ccy} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No exits recorded — this trade is open.</p>
          )}
        </Section>
        <Section title="Rule violations" actions={<Link href="/risk" className="text-xs text-muted-foreground hover:text-foreground">Risk</Link>}>
          {t.violations.length ? (
            <ul className="-my-1 flex flex-col divide-y text-sm">
              {t.violations.map((v) => (
                <li key={v.id} className="flex items-start gap-2 py-2">
                  <ShieldAlert className={v.severity === "BREACH" ? "mt-0.5 size-4 shrink-0 text-loss" : "mt-0.5 size-4 shrink-0 text-warning"} aria-label={v.severity === "BREACH" ? "Breach" : "Warning"} />
                  <div className="min-w-0">
                    <div>{v.message}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.day} · {v.source === "PROP_RULE" ? "Prop rule" : "Your rule"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">This trade broke no rules.</p>
          )}
        </Section>
      </div>

      <Section title="Journal" description="Autosaves as you type.">
        <JournalEditor tradeId={t.id} initial={{ journal: journalFromData(t.journal), tagIds: t.tags.map((x) => x.id), notes: t.notes ?? "" }} tags={options.tags} />
      </Section>

      <Section title="Screenshots" description="Stored privately; only you can view them.">
        <ScreenshotGallery tradeId={t.id} screenshots={t.screenshots} timezone={tz} />
      </Section>
    </div>
  );
}
