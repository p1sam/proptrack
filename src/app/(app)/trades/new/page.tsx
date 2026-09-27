import Link from "next/link";
import { Layers } from "lucide-react";
import { requireUser } from "@/server/session";
import { getTradeFormOptions } from "@/server/queries/trades";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { TradeForm } from "@/components/trades/trade-form";

export const metadata = { title: "New trade" };

export default async function NewTradePage(props: PageProps<"/trades/new">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const options = await getTradeFormOptions(user.id);
  const requested = typeof sp.account === "string" ? sp.account : undefined;
  const defaultAccountId = options.accounts.find((a) => a.id === requested)?.id;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="New trade" description="Log a trade by hand. Everything except the basics is optional." />
      {options.accounts.length ? (
        <TradeForm options={options} mode="create" defaultAccountId={defaultAccountId} />
      ) : (
        <EmptyState
          icon={<Layers />}
          title="Add an account first"
          description="Every trade belongs to a trading account."
          action={
            <Button asChild>
              <Link href="/accounts?new=1">Add account</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
