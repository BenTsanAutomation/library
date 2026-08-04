"use client";

import { Sparkles } from "lucide-react";

import type { ZBookmark } from "@library/shared/types/bookmarks";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";

export default function UnknownCard({
  bookmark,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  return (
    <BookmarkLayoutAdaptingCard
      title={bookmark.title}
      bookmark={bookmark}
      className={className}
      wrapTags={true}
      image={(_layout) => (
        <div className="flex size-full flex-1 flex-col items-center justify-center gap-2 bg-[var(--bg-elevated)] dark:bg-[var(--bg-inset)]">
          <Sparkles className="h-6 w-6 text-[var(--fg-muted)] opacity-60" />
          <span className="font-display text-[15px] italic text-[var(--fg-muted)]">
            preparing…
          </span>
        </div>
      )}
    />
  );
}
