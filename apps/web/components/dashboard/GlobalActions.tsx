"use client";

import BulkBookmarksAction from "@/components/dashboard/BulkBookmarksAction";
import SortOrderToggle from "@/components/dashboard/SortOrderToggle";
import ViewOptions from "@/components/dashboard/ViewOptions";
import { useInBookmarkGridStore } from "@/lib/store/useInBookmarkGridStore";
import { useLibraryUIStore } from "@/lib/store/useLibraryUIStore";

export default function GlobalActions() {
  const inBookmarkGrid = useInBookmarkGridStore(
    (state) => state.inBookmarkGrid,
  );
  const toggleComposer = useLibraryUIStore((state) => state.toggleComposer);

  return (
    <div className="library-global-toolbar flex min-w-max items-center gap-2 rounded-full border border-white/15 bg-card/90 px-2 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
      <button
        type="button"
        onClick={toggleComposer}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-base font-semibold text-white shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_88%,#000_12%)]"
        aria-label="Open quick composer"
        title="Quick save"
      >
        +
      </button>
      {inBookmarkGrid && <ViewOptions />}
      {inBookmarkGrid && <BulkBookmarksAction />}
      {inBookmarkGrid && <SortOrderToggle />}
      <span className="hidden pl-1 pr-2 text-xs font-medium text-[var(--fg-muted)] md:inline">
        Quick actions
      </span>
    </div>
  );
}
