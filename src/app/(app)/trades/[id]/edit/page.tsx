import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getTradeDetail, getTradeFormOptions } from "@/server/queries/trades";
import { PageHeader } from "@/components/app/page-header";
import { TradeForm, type TradeFormInitial } from "@/components/trades/trade-form";
import { journalFromData } from "@/components/trades/journal-values";

export const metadata = { title: "Edit trade" };

export default async function EditTradePage(props: PageProps<"/trades/[id]/edit">) {
  const user = await requireUser();
  const { id } = await props.params;
  const [t, options] = await Promise.all([getTradeDetail(user.id, id), getTradeFormOptions(user.id)]);
  if (!t) notFound();

  const initial: TradeFormInitial = {
    accountId: t.account.id,
    symbol: t.symbol,
    pointValue: t.pointValue,
    direction: t.direction,
    openedAt: t.openedAt,
    entryPrice: t.entryPrice,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    quantity: t.quantity,
    exits: t.exits.map((e) => ({ price: e.price, quantity: e.quantity, exitedAt: e.exitedAt })),
    commission: t.commission,
    swap: t.swap,
    reportedGrossPnl: t.reportedGrossPnl,
    riskAmountOverride: t.riskAmountOverride,
    mfePrice: t.mfePrice,
    maePrice: t.maePrice,
    strategyId: t.strategy?.id ?? null,
    setup: t.setup,
    timeframe: t.timeframe,
    tradeType: t.tradeType,
    entryModel: t.entryModel,
    confluences: t.confluences,
    marketCondition: t.marketCondition,
    grade: t.grade,
    tagIds: t.tags.map((x) => x.id),
    notes: t.notes,
    journal: journalFromData(t.journal),
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`Edit ${t.symbol} ${t.direction === "LONG" ? "long" : "short"}`} description={t.account.name} />
      <TradeForm options={options} mode="edit" tradeId={t.id} initial={initial} linkedCopies={t.copies.length} />
    </div>
  );
}
