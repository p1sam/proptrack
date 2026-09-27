import { requireUser } from "@/server/session";
import { PageHeader } from "@/components/app/page-header";
import { parseSettingsTab, SettingsNav } from "@/components/settings/settings-nav";
import { CurrenciesTab, InstrumentsTab, IntegrationsTab, PreferencesTab, ProfileTab, PropFirmsTab, SessionsTab, StrategiesTab, TagsTab } from "@/components/settings/tabs";

export const metadata = { title: "Settings" };

export default async function SettingsPage(props: PageProps<"/settings">) {
  const user = await requireUser();
  const tab = parseSettingsTab((await props.searchParams).tab);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="Your profile, calculation preferences and the lists your trades are classified with." />
      <SettingsNav current={tab} />
      {tab === "profile" && <ProfileTab userId={user.id} />}
      {tab === "preferences" && <PreferencesTab userId={user.id} />}
      {tab === "sessions" && <SessionsTab userId={user.id} />}
      {tab === "strategies" && <StrategiesTab userId={user.id} />}
      {tab === "instruments" && <InstrumentsTab userId={user.id} />}
      {tab === "tags" && <TagsTab userId={user.id} />}
      {tab === "firms" && <PropFirmsTab userId={user.id} />}
      {tab === "currencies" && <CurrenciesTab userId={user.id} />}
      {tab === "integrations" && <IntegrationsTab />}
    </div>
  );
}
