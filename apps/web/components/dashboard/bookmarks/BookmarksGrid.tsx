import { useEffect } from "react";
import NoBookmarksBanner from "@/components/dashboard/bookmarks/NoBookmarksBanner";
import { ActionButton } from "@/components/ui/action-button";
import useBulkActionsStore from "@/lib/bulkActions";
import { useInBookmarkGridStore } from "@/lib/store/useInBookmarkGridStore";
import { bookmarkLayoutSwitch, useBookmarkLayout } from "@/lib/userLocalSettings/bookmarksLayout";
import { Slot } from "@radix-ui/react-slot";
import { ErrorBoundary } from "react-error-boundary";
import { useInView } from "react-intersection-observer";

import type { ZBookmark } from "@library/shared/types/bookmarks";
import { useBookmarkListContext } from "@library/shared-react/hooks/bookmark-list-context";

import LibraryBookmarkCard from "../../library/BookmarkCard";
import EditorCard from "./EditorCard";
import UnknownCard from "./UnknownCard";

function StyledBookmarkCard({ children }: { children: React.ReactNode }) {
  return (
    <Slot className="mb-6 block break-inside-avoid rounded-[1.5rem] border border-border/70 bg-card/95 shadow-[0_10px_30px_rgba(60,48,35,0.06)] duration-300 ease-in hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(60,48,35,0.12)] hover:transition-all">
      {children}
    </Slot>
  );
}

export default function BookmarksGrid({
  bookmarks,
  hasNextPage = false,
  fetchNextPage = () => ({}),
  isFetchingNextPage = false,
  showEditorCard = false,
  emptyVariant = "first-time",
}: {
  bookmarks: ZBookmark[];
  showEditorCard?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  emptyVariant?: "first-time" | "smart-space" | "search";
}) {
  const layout = useBookmarkLayout();
  const bulkActionsStore = useBulkActionsStore();
  const inBookmarkGrid = useInBookmarkGridStore();
  const withinListContext = useBookmarkListContext();
  const { ref: loadMoreRef, inView: loadMoreButtonInView } = useInView();

  useEffect(() => {
    bulkActionsStore.setVisibleBookmarks(bookmarks);
    bulkActionsStore.setListContext(withinListContext);

    return () => {
      bulkActionsStore.setVisibleBookmarks([]);
      bulkActionsStore.setListContext(undefined);
    };
  }, [bookmarks, withinListContext?.id]);

  useEffect(() => {
    inBookmarkGrid.setInBookmarkGrid(true);
    return () => {
      inBookmarkGrid.setInBookmarkGrid(false);
    };
  }, []);

  useEffect(() => {
    if (loadMoreButtonInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [loadMoreButtonInView]);

  if (bookmarks.length == 0 && !showEditorCard) {
    return <NoBookmarksBanner variant={emptyVariant} />;
  }

  const children = [
    showEditorCard && (
      <StyledBookmarkCard key={"editor"}>
        <EditorCard />
      </StyledBookmarkCard>
    ),
    ...bookmarks.map((b) => (
      <ErrorBoundary key={b.id} fallback={<UnknownCard bookmark={b} />}>
        <StyledBookmarkCard>
          <LibraryBookmarkCard bookmark={b} />
        </StyledBookmarkCard>
      </ErrorBoundary>
    )),
  ];
  return (
    <>
      {bookmarkLayoutSwitch(layout, {
        masonry: <div className="library-masonry sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">{children}</div>,
        grid: <div className="library-masonry sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">{children}</div>,
        list: <div className="grid grid-cols-1 gap-4">{children}</div>,
        compact: <div className="grid grid-cols-1 gap-4">{children}</div>,
      })}
      {hasNextPage && (
        <div className="mt-2 flex justify-center">
          <ActionButton
            ref={loadMoreRef}
            ignoreDemoMode={true}
            loading={isFetchingNextPage}
            onClick={() => fetchNextPage()}
            variant="ghost"
          >
            Load More
          </ActionButton>
        </div>
      )}
    </>
  );
}
