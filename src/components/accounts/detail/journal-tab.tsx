import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { getAccountJournal } from "@/server/queries/account-detail";
import { formatDateTime } from "@/lib/format";
import { Section } from "@/components/app/page-header";
import { Pnl, RValue } from "@/components/app/pnl";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";

function snippet(s: string | null | undefined, n = 220) {
  if (!s) return null;
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export async function JournalTab({ userId, accountId, currency, timezone }: { userId: string; accountId: string; currency: string; timezone: string }) {
  const entries = await getAccountJournal(userId, accountId);
  if (!entries.length) {
    return <EmptyState icon={<BookOpen />} title="No journal entries on this account" description="Open a trade and write its journal (reason, lesson, mistakes) — entries show up here." />;
  }
  return (
    <Section
      title="Journal"
      description={`${entries.length} trade${entries.length === 1 ? "" : "s"} with notes or a journal entry${entries.length >= 60 ? " (latest 60)" : ""}`}
      actions={
        <Link href={`/journal?accounts=${accountId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          Open journal <ArrowRight className="size-3" aria-hidden />
        </Link>
      }
    >
      <ul className="-my-2 divide-y">
        {entries.map((t) => {
          const j = t.journal;
          const lesson = snippet(j?.lesson);
          const mistakes = snippet(j?.mistakes);
          const wrong = snippet(j?.wentWrong);
          const well = snippet(j?.wentWell);
          const notes = snippet(t.notes);
          const reason = snippet(j?.reason);
          return (
            <li key={t.id} className="py-3">
              <Link href={`/trades/${t.id}`} className="group flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className={t.direction === "LONG" ? "text-xs text-profit" : "text-xs text-loss"}>{t.direction === "LONG" ? "Long" : "Short"}</span>
                <span className="font-medium group-hover:underline">{t.symbol}</span>
                <span className="text-xs text-muted-foreground tabular">{formatDateTime(t.closedAt ?? t.openedAt, timezone)}</span>
                <span className="ml-auto flex items-center gap-3">
                  <RValue value={t.rMultiple} className="text-xs" />
                  <Pnl value={t.netPnl} currency={currency} />
                </span>
              </Link>
              <div className="mt-1.5 flex flex-col gap-1 text-sm">
                {lesson && (
                  <p>
                    <span className="font-medium">Lesson:</span> <span className="text-muted-foreground">{lesson}</span>
                  </p>
                )}
                {mistakes && (
                  <p>
                    <span className="font-medium text-loss">Mistakes:</span> <span className="text-muted-foreground">{mistakes}</span>
                  </p>
                )}
                {!lesson && !mistakes && wrong && (
                  <p>
                    <span className="font-medium">Went wrong:</span> <span className="text-muted-foreground">{wrong}</span>
                  </p>
                )}
                {!lesson && !mistakes && !wrong && well && (
                  <p>
                    <span className="font-medium">Went well:</span> <span className="text-muted-foreground">{well}</span>
                  </p>
                )}
                {!lesson && !mistakes && !wrong && !well && reason && (
                  <p>
                    <span className="font-medium">Reason:</span> <span className="text-muted-foreground">{reason}</span>
                  </p>
                )}
                {notes && <p className="text-muted-foreground">{notes}</p>}
                {(t.tags.length > 0 || j?.followedPlan !== null) && (
                  <div className="flex flex-wrap items-center gap-1">
                    {j && j.followedPlan !== null && (
                      <Badge variant="outline" className={j.followedPlan ? "text-[10px] text-profit" : "text-[10px] text-loss"}>
                        {j.followedPlan ? "Followed plan" : "Broke plan"}
                      </Badge>
                    )}
                    {t.tags.map((tag) => (
                      <Badge key={tag.id} variant="secondary" className={tag.kind === "MISTAKE" ? "text-[10px] text-loss" : "text-[10px]"}>
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
