"use client";

import { useEffect } from "react";
import Link from "next/link";
import SidebarItem from "@/components/shared/sidebar/SidebarItem";
import { useUpdateUserSettings } from "@library/shared-react/hooks/users";
import type { ZUserSettings } from "@library/shared/types/users";

import LibraryLogo from "@/components/LibraryIcon";
import { useLibraryUIStore } from "@/lib/store/useLibraryUIStore";
import { cn } from "@/lib/utils";

import type { TSidebarItem } from "../shared/sidebar/TSidebarItem";

export default function SidebarShell({
  items,
  extraSections,
  userSettings,
}: {
  items: TSidebarItem[];
  extraSections?: React.ReactNode;
  userSettings: ZUserSettings;
}) {
  const sidebarOpen = useLibraryUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useLibraryUIStore((state) => state.setSidebarOpen);
  const { mutate: updateSettings, isPending } = useUpdateUserSettings();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "\\") {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
          return;
        }
        event.preventDefault();
        setSidebarOpen(!sidebarOpen);
      }
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setSidebarOpen, sidebarOpen]);

  const desktopPinned = userSettings.sidebarMode === "always";

  return (
    <>
      {!desktopPinned && sidebarOpen && (
        <button
          type="button"
          aria-label="Close library navigation"
          className="library-nav-backdrop fixed inset-0 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed left-0 top-16 z-50 flex h-[calc(100vh-64px)] w-[200px] flex-col gap-6 border-r border-border/60 bg-[var(--bg-surface)] px-4 py-5 shadow-[0_18px_40px_rgba(32,24,18,0.12)] backdrop-blur-md transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)]",
          desktopPinned
            ? "translate-x-0"
            : sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full",
          desktopPinned && "lg:translate-x-0",
          !desktopPinned && "lg:data-[sidebar-open=false]:-translate-x-full",
        )}
        data-sidebar-open={sidebarOpen}
      >
        <div className="flex items-center justify-between px-1">
          <Link href="/dashboard/bookmarks" className="text-[var(--fg-primary)]">
            <LibraryLogo height={28} />
          </Link>
          <button
            type="button"
            className="text-xs text-[var(--fg-muted)]"
            onClick={() =>
              updateSettings({
                sidebarMode: desktopPinned ? "slideover" : "always",
              })
            }
            disabled={isPending}
          >
            {desktopPinned ? "auto-hide" : "keep open"}
          </button>
        </div>
        <ul className="space-y-1.5 text-sm">
          {items.map((item) => (
            <SidebarItem
              key={item.name}
              logo={item.icon}
              name={item.name}
              path={item.path}
            />
          ))}
        </ul>
        {extraSections}
      </aside>
      {desktopPinned && <div className="hidden w-[200px] lg:block" aria-hidden />}
    </>
  );
}
