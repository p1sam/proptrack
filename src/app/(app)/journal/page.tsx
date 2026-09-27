import Link from "next/link";
import { BookOpen, CheckCircle2, CircleSlash, PenLine } from "lucide-react";
import { requireUser } from "@/server/session";
import { getFilterOptions } from "@/server/queries/options";
import { JOURNAL_PAGE_SIZE, listJournal } from "@/server/queries/trades";
import { EMOTIONS } from "@/lib/calc/behavior";
import { activeFilterCount, parseTradeFilters } from "@/lib/filters";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { PageHeader, Section } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Pnl, RValue } from "@/components/app/pnl";
import { FilterBar } from "@/components/filters/filter-bar";
import { CopyBadge, DirectionBadge, OpenBadge } from "@/components/trades/badges";
import { EMOTION_META, gradeLabel } from "@/components/trades/labels";
import { Pagination } from "@/components/trades/pagination";
import { TagList } from "@/components/trades/tag-picker";
import { TradeSearch } from "@/components/trades/trade-search";
import { cn } from "@/lib/utils";

export const metadata = { title: "Journal" };

function Excerpt({ label, text, tone }: { label: string; text: string | null | undefined; tone?: "loss" }) {
  if (!text) return null;
  return (
    <div className="min-w-0">
      <dt className={cn("text-[11px] font-medium tracking-wide uppercase", tone === "loss" ? "text-loss" : "text-muted-foreground")}>{label}</dt>
      <dd className="line-clamp-4 text-sm whitespace-pre-line">{text}</dd>
    </div>
  );
}

export default async function JournalPage(props: PageProps<"/journal">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filters = parseTradeFilters(sp);
  const page = Math.max(1, Math.floor(Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1));
  const [options, j] = await Promise.all([getFilterOptions(user.id), listJournal(user.id, filters, page)]);
  const tz = j.prefs.timezone;
  const filtered = activeFilterCount(filters) > 0 || (filters.range && filters.range !== "all");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Journal" description="Your trade reviews, newest first." />
      <div className="flex flex-col gap-2">
        <TradeSearch placeholder="Search thesis, lesson, mistakes, notes, symbol…" />
        <FilterBar
          options={{
            accounts: options.accounts,
            firms: options.firms,
            strategies: options.strategies,
            symbols: options.symbols,
            sessions: options.sessions,
            setups: options.setups,
            tags: options.tags,
          }}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          {j.entries.length ? (
            <>
              <ul className="flex flex-col gap-3">
                {j.entries.map((e) => {
                  const jr = e.journal;
                  const rated = jr ? EMOTIONS.filter((k) => jr[k] !== null) : [];
                  return (
                    <li key={e.id}>
                      <article className="rounded-lg border bg-card" aria-labelledby={`je-${e.id}`}>
                        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5">
                          <h2 id={`je-${e.id}`} className="flex items-center gap-2 text-sm font-semibold">
                            <Link href={`/trades/${e.id}`} className="hover:underline">
                              {e.symbol}
                            </Link>
                            <DirectionBadge direction={e.direction} />
                            {e.status === "OPEN" && <OpenBadge />}
                          </h2>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {e.account}
                            {e.copied && <CopyBadge />}
                            {e.strategy && <> · {e.strategy}</>}
                            {e.grade && <> · Grade {gradeLabel(e.grade)}</>}
                          </span>
                          <span className="ml-auto flex items-center gap-3 text-sm">
                            <span className="text-xs text-muted-foreground tabular">{formatDateTime(e.closedAt ?? e.openedAt, tz)}</span>
                            <RValue value={e.rMultiple} />
                            {e.status === "CLOSED" && <Pnl value={e.netPnl} currency={e.currency} className="font-medium" />}
                          </span>
                        </header>
                        <div className="grid gap-3 px-4 py-3">
                          <dl className="grid gap-3 md:grid-cols-2">
                            <Excerpt label="Thesis" text={jr?.thesis ?? jr?.reason} />
                            <Excerpt label="What happened" text={jr?.whatHappened} />
                            <Excerpt label="Lesson" text={jr?.lesson} />
                            <Excerpt label="Mistakes" text={jr?.mistakes} tone="loss" />
                            <Excerpt label="Notes" text={e.notes} />
                          </dl>
                          {(rated.length > 0 || jr?.followedPlan != null || e.tags.length > 0) && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                              {jr?.followedPlan != null && (
                                <span className={cn("inline-flex items-center gap-1", jr.followedPlan ? "text-profit" : "text-loss")}>
                                  {jr.followedPlan ? <CheckCircle2 className="size-3.5" /> : <CircleSlash className="size-3.5" />}
                                  {jr.followedPlan ? "Followed plan" : "Broke plan"}
                                </span>
                              )}
                              {rated.length > 0 && (
                                <ul className="flex flex-wrap gap-1" aria-label="Emotion ratings (1–5)">
                                  {rated.map((k) => {
                                    const val = jr![k]!;
                                    const meta = EMOTION_META[k];
                                    const concerning = meta.positive ? val <= 2 : val >= 4;
                                    return (
                                      <li key={k} className={cn("rounded border px-1.5 py-px tabular", concerning ? "border-warning/40 text-warning" : "text-muted-foreground")}>
                                        {meta.label} {val}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                              <TagList tags={e.tags} />
                            </div>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
              <Pagination path="/journal" params={sp} page={j.page} pages={j.pages} total={j.total} pageSize={JOURNAL_PAGE_SIZE} noun="entries" />
            </>
          ) : (
            <EmptyState
              icon={<BookOpen />}
              title={filtered || filters.q ? "No journal entries match" : "No journal entries yet"}
              description={filtered || filters.q ? "Try widening the filters." : "Open a trade and write down your thesis, what happened and the lesson. Entries appear here."}
            />
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <Section title="Needs review" description={j.reviewCount ? `${j.reviewCount} closed trade${j.reviewCount === 1 ? "" : "s"} without a journal` : "Every closed trade is journaled"}>
            {j.review.length ? (
              <ul className="-mx-4 -my-4 divide-y">
                {j.review.map((t) => (
                  <li key={t.id}>
                    <Link href={`/trades/${t.id}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/40">
                      <PenLine className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{t.symbol}</span> <span className="text-xs text-muted-foreground">{t.direction === "LONG" ? "long" : "short"}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t.account} · {formatShortDate(t.closedAt, tz)}
                        </span>
                      </span>
                      <span className="text-right text-xs">
                        <Pnl value={t.netPnl} currency={t.currency} />
                        <span className="block">
                          <RValue value={t.rMultiple} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to review in this filter.</p>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
