"use client";

import LibraryLogo from "@/components/LibraryIcon";
import { useLibraryUIStore } from "@/lib/store/useLibraryUIStore";

export default function SidebarToggleButton() {
  const toggleSidebar = useLibraryUIStore((state) => state.toggleSidebar);

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="library-nav-button inline-flex items-center gap-2 text-[var(--fg-primary)]"
      aria-label="Toggle library navigation"
      title="Show navigation"
    >
      <LibraryLogo height={32} />
      <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] md:inline">
        Menu
      </span>
    </button>
  );
}
