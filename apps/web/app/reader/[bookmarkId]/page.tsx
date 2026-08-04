"use client";

import { Suspense, useState } from "react";
import { useParams } from "next/navigation";
import HighlightCard from "@/components/dashboard/highlights/HighlightCard";
import ReaderView from "@/components/dashboard/preview/ReaderView";
import ReaderChrome from "@/components/library/ReaderChrome";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Separator } from "@/components/ui/separator";
import { useSession } from "@/lib/auth/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { useQuery } from "@tanstack/react-query";
import { HighlighterIcon as Highlight, X } from "lucide-react";

import { useTRPC } from "@library/shared-react/trpc";
import { BookmarkTypes } from "@library/shared/types/bookmarks";
import { getBookmarkTitle } from "@library/shared/utils/bookmarkUtils";

export default function ReaderViewPage() {
  const api = useTRPC();
  const params = useParams<{ bookmarkId: string }>();
  const bookmarkId = params.bookmarkId;
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId,
    }),
  );
  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions({
      bookmarkId,
    }),
  );

  const { data: session } = useSession();
  const { settings } = useReaderSettings();
  const [showHighlights, setShowHighlights] = useState(false);
  const isOwner = session?.user?.id === bookmark?.userId;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--fg-primary)]">
      {bookmark && <ReaderChrome bookmark={bookmark} />}

      <div className="flex overflow-hidden">
        {showHighlights && (
          <button
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setShowHighlights(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowHighlights(false);
              }
            }}
            aria-label="Close highlights sidebar"
          />
        )}

        <main
          className={`flex-1 overflow-x-hidden transition-all duration-300 ${showHighlights ? "lg:mr-80" : ""}`}
        >
          <article className="mx-auto max-w-[66ch] overflow-x-hidden px-6 pb-16 pt-28 font-display sm:px-8">
            {bookmark ? (
              <>
                <header className="mb-8 space-y-4">
                  <h1
                    className="leading-tight text-[var(--fg-primary)]"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: `${settings.fontSize * 1.8}px`,
                      lineHeight: settings.lineHeight * 0.9,
                    }}
                  >
                    {getBookmarkTitle(bookmark)}
                  </h1>
                  <div className="flex items-center gap-4 text-sm text-[var(--fg-muted)]">
                    {bookmark.content.type == BookmarkTypes.LINK && (
                      <span>By {bookmark.content.author}</span>
                    )}
                    <Separator orientation="vertical" className="h-4" />
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--fg-faint)] px-3 py-1 text-xs"
                      onClick={() => setShowHighlights((value) => !value)}
                    >
                      <Highlight className="h-3.5 w-3.5" />
                      highlights
                    </button>
                  </div>
                </header>

                <Suspense fallback={<FullPageSpinner />}>
                  <div className="overflow-x-hidden text-[19px] leading-[1.7]">
                    <ReaderView
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: 1.7,
                      }}
                      bookmarkId={bookmarkId}
                      readOnly={!isOwner}
                      progressBarStyle={{ position: "fixed", top: "0" }}
                    />
                  </div>
                </Suspense>
              </>
            ) : (
              <FullPageSpinner />
            )}
          </article>
        </main>

        {showHighlights && highlights && (
          <aside className="fixed right-0 top-0 z-50 h-screen w-full border-l bg-[var(--bg-surface)] sm:w-80 lg:z-auto lg:bg-[var(--bg-surface)]/95 lg:backdrop-blur print:hidden">
            <div className="flex h-full flex-col pt-20">
              <div className="border-b p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Highlights</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--fg-muted)]">
                      {highlights.highlights.length} saved
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 lg:hidden"
                      onClick={() => setShowHighlights(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                <div className="space-y-4">
                  {highlights.highlights.map((highlight) => (
                    <HighlightCard
                      key={highlight.id}
                      highlight={highlight}
                      clickable={true}
                      readOnly={!isOwner}
                    />
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
