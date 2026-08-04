"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@library/shared-react/trpc";
import type { ZBookmark } from "@library/shared/types/bookmarks";

function labelFor(bookmark: ZBookmark) {
  if (bookmark.title) return bookmark.title;
  if (bookmark.content.type === "text") return bookmark.content.text || "note";
  if (bookmark.content.type === "link") {
    return bookmark.content.title ?? bookmark.content.url;
  }
  if (bookmark.content.type === "asset") {
    return bookmark.content.fileName ?? bookmark.content.assetType;
  }
  return "untitled";
}

export default function SerendipityStrip({
  userId,
  initialBookmarks,
}: {
  userId: string;
  initialBookmarks: ZBookmark[];
}) {
  const api = useTRPC();
  const { data } = useQuery(
    api.bookmarks.getSerendipity.queryOptions(
      { count: 3, windowDays: 90 },
      {
        initialData: { bookmarks: initialBookmarks, nextCursor: null },
        staleTime: 24 * 60 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
      },
    ),
  );

  const bookmarks = data?.bookmarks ?? initialBookmarks;
  if (bookmarks.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="font-display text-[28px] italic leading-[1.2] text-[var(--fg-primary)]">
        remember this?
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {bookmarks.map((bookmark) => (
          <Link
            key={bookmark.id}
            href={`/dashboard/preview/${bookmark.id}`}
            className="rounded-[10px] border border-[var(--fg-faint)] bg-[var(--bg-surface)] p-4 shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
          >
            <p className="line-clamp-3 text-sm text-[var(--fg-primary)]">
              {labelFor(bookmark)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
