import Link from "next/link";

import type { ZBookmark } from "@library/shared/types/bookmarks";

function bookmarkLabel(b: ZBookmark): string {
  if (b.title) return b.title;
  if (b.content.type === "link") return b.content.title ?? b.content.url;
  if (b.content.type === "text") {
    const t = b.content.text ?? "";
    return t.length > 80 ? t.slice(0, 80) + "…" : t || "note";
  }
  if (b.content.type === "asset")
    return b.content.fileName ?? b.content.assetType;
  return "untitled";
}

export default function TopOfMindStrip({
  bookmarks,
}: {
  bookmarks: ZBookmark[];
}) {
  if (bookmarks.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-[28px] italic leading-[1.2] text-[var(--fg-primary)]">
        top of mind
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {bookmarks.map((bookmark) => (
          <Link
            key={bookmark.id}
            href={`/dashboard/preview/${bookmark.id}`}
            className="flex min-w-[180px] max-w-[220px] flex-col rounded-[10px] border border-[var(--fg-faint)] bg-[var(--bg-surface)] px-4 py-3 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <span className="text-xs uppercase tracking-[0.18em] text-[var(--pin)]">
              pinned
            </span>
            <span className="mt-2 line-clamp-2 text-sm text-[var(--fg-primary)]">
              {bookmarkLabel(bookmark)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
