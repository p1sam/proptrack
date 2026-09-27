import Link from "next/link";
import { Layers } from "lucide-react";
import { requireUser } from "@/server/session";
import { getImportPageData } from "@/server/queries/import-batches";
import { adapterSummaries } from "@/lib/import/adapters";
import { PageHeader, Section } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "@/components/import/import-wizard";
import { ImportHistory } from "@/components/import/import-history";
import { SourceList } from "@/components/import/source-list";

export const metadata = { title: "Import trades" };

export default async function ImportTradesPage(props: PageProps<"/trades/import">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const data = await getImportPageData(user.id);
  const requested = typeof sp.account === "string" ? sp.account : undefined;
  const defaultAccountId = data.accounts.find((a) => a.id === requested)?.id;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Import trades"
        description="Upload a CSV export from your platform. Columns, dates and number formats are detected; you review everything before it is saved."
        actions={
          <Button variant="outline" asChild>
            <Link href="/trades">Back to trades</Link>
          </Button>
        }
      />

      {data.accounts.length ? (
        <Section title="CSV import">
          <ImportWizard accounts={data.accounts} defaultAccountId={defaultAccountId} userTimezone={data.timezone} />
        </Section>
      ) : (
        <EmptyState
          icon={<Layers />}
          title="Add an account first"
          description="Imported trades are added to one of your trading accounts."
          action={
            <Button asChild>
              <Link href="/accounts?new=1">Add account</Link>
            </Button>
          }
        />
      )}

      <Section title="Recent imports" description="Undo deletes every trade an import created and recalculates the account.">
        <ImportHistory batches={data.batches} timezone={data.timezone} />
      </Section>

      <Section title="Sources" description="Generic CSV works with any platform export. Direct integrations are listed here as they are built.">
        <SourceList sources={adapterSummaries()} />
      </Section>
    </div>
  );
}
