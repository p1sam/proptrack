import Link from "next/link";
import { requireUser } from "@/server/session";
import { SidebarNav } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { Logo } from "@/components/app/logo";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
        <Link href="/" className="flex h-14 items-center border-b px-4">
          <Logo />
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: user.name, email: user.email }} />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  );
}
