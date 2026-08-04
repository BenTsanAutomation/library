import { redirect } from "next/navigation";
import GlobalActions from "@/components/dashboard/GlobalActions";
import ProfileOptions from "@/components/dashboard/header/ProfileOptions";
import { SearchInput } from "@/components/dashboard/search/SearchInput";
import SidebarToggleButton from "@/components/library/SidebarToggleButton";
import { getServerAuthSession } from "@/server/auth";

export default async function Header() {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  return (
    <header className="sticky left-0 right-0 top-0 z-50 flex h-16 items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-4 shadow-[0_10px_28px_rgba(58,47,35,0.06)] backdrop-blur-xl">
      <div className="flex shrink-0 items-center gap-2">
        <SidebarToggleButton />
        <span className="hidden text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fg-muted)] md:inline">
          Navigation
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SearchInput className="rounded-full border border-border/70 bg-muted/80 px-2" />
        <div className="shrink-0">
          <GlobalActions />
        </div>
      </div>
      <div className="ml-1 flex shrink-0 items-center">
        <ProfileOptions />
      </div>
    </header>
  );
}
