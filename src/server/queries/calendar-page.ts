import "server-only";
import { isDayKey, isMonthKey, monthWeeks, shiftMonth, yearMonths } from "@/lib/calc/calendar";
import { buildDailySeries, buildMonthlySeries, summarizeDays } from "@/lib/calc/equity";
import { dayKey } from "@/lib/calc/time";
import type { TradeFilters } from "@/lib/filters";
import { getPrefs } from "./accounts";
import { statsOf } from "./analytics";
import { datasetNotes, toFilterBarOptions } from "./analytics-page";
import { loadDataset } from "./dataset";
import { getFilterOptions } from "./options";

/**
 * Calendar read model. The period comes from month navigation, not the range filter: the whole
 * calendar year of the shown month is loaded (with a small margin, because the date filter works on
 * the stored trading day) and then bucketed exactly by close day in the user's timezone.
 */
export async function getCalendarPage(userId: string, filters: TradeFilters, input: { month?: string; day?: string }) {
  const prefs = await getPrefs(userId);
  const today = dayKey(new Date(), prefs.timezone);
  const day = isDayKey(input.day) ? input.day : null;
  const month = isMonthKey(input.month) ? input.month : day ? day.slice(0, 7) : today.slice(0, 7);
  const year = Number(month.slice(0, 4));

  const scoped: TradeFilters = { ...filters, range: undefined, from: `${year - 1}-12-25`, to: `${year + 1}-01-07` };
  const [ds, options] = await Promise.all([loadDataset(userId, scoped), getFilterOptions(userId)]);
  const tol = ds.breakevenTolerance;
  const yearTrades = ds.trades.filter((t) => t.closeDay.startsWith(`${year}-`));
  const monthTrades = yearTrades.filter((t) => t.closeDay.startsWith(month));
  const daily = buildDailySeries(yearTrades, ds.timezone, tol);
  const monthDays = daily.filter((d) => d.day.startsWith(month));

  const monthly = new Map(buildMonthlySeries(daily).map((m) => [m.month, m]));
  const months = yearMonths(year).map((m) => monthly.get(m) ?? { month: m, pnl: 0, trades: 0, winningDays: 0, losingDays: 0 });

  const dayTrades = day ? ds.trades.filter((t) => t.closeDay === day) : [];
  const noCapital = { breakevenTolerance: tol, startingCapital: 0 };

  return {
    today,
    month,
    year,
    prevMonth: shiftMonth(month, -1),
    nextMonth: shiftMonth(month, 1),
    notes: { ...datasetNotes(ds), trades: yearTrades.length },
    filterOptions: toFilterBarOptions(options),
    days: monthDays,
    yearDays: daily,
    weeks: monthWeeks(month, monthDays),
    summary: summarizeDays(monthDays),
    monthStats: statsOf(monthTrades, noCapital),
    months,
    yearSummary: summarizeDays(daily),
    yearStats: statsOf(yearTrades, noCapital),
    day: day
      ? {
          day,
          stats: statsOf(dayTrades, noCapital),
          trades: dayTrades.map((t) => ({
            id: t.id,
            openedAt: t.openedAt.toISOString(),
            closedAt: t.closedAt.toISOString(),
            accountName: t.accountName,
            copies: t.copies,
            symbol: t.symbol,
            direction: t.direction,
            netPnl: t.netPnl,
            rMultiple: t.rMultiple ?? null,
            strategyName: t.strategyName,
          })),
        }
      : null,
  };
}
export type CalendarPageData = Awaited<ReturnType<typeof getCalendarPage>>;
