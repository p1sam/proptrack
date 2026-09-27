import { notFound } from "next/navigation";
import { getAccountLineage, type AccountDetail } from "@/server/queries/account-detail";
import { Section } from "@/components/app/page-header";
import { EventForm } from "../account-actions-menu";
import { EventTimeline, LifecycleStrip } from "../lifecycle";

export async function TimelineTab({ userId, detail }: { userId: string; detail: AccountDetail }) {
  const { summary: a, state: s, prefs } = detail;
  const lineage = await getAccountLineage(userId, a.id);
  if (!lineage) notFound();
  const funded = a.group === "funded";
  return (
    <div className="flex flex-col gap-5">
      <Section title="Lifecycle" description={lineage.accounts.length > 1 ? `${lineage.accounts.length} linked accounts` : "Single account"}>
        <LifecycleStrip
          lineage={lineage}
          currentId={a.id}
          nextPayout={funded ? { eligible: s.payout.eligible, daysSinceLastPayout: s.payout.daysSinceLastPayout, frequencyDays: s.payout.frequencyDays } : null}
        />
      </Section>
      <div className="grid gap-5 xl:grid-cols-5">
        <Section title="Events" description="Newest first, across the whole chain" className="xl:col-span-3">
          <EventTimeline lineage={lineage} currentId={a.id} timezone={prefs.timezone} />
        </Section>
        <Section title="Add event" className="self-start xl:col-span-2">
          <EventForm accountId={a.id} currency={a.currency} formId="timeline-event" />
        </Section>
      </div>
    </div>
  );
}
