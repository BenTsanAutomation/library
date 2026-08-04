import LinkPreviewFallback from "@/components/dashboard/preview/LinkPreviewFallback";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";

import BookmarkHTMLHighlighter from "@library/shared-react/components/BookmarkHtmlHighlighter";
import ScrollProgressTracker from "@library/shared-react/components/ScrollProgressTracker";
import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@library/shared-react/hooks/highlights";
import { useReadingProgress } from "@library/shared-react/hooks/reading-progress";
import { useTRPC } from "@library/shared-react/trpc";
import { BookmarkTypes } from "@library/shared/types/bookmarks";

import ReadingProgressBanner from "./ReadingProgressBanner";

export default function ReaderView({
  bookmarkId,
  className,
  style,
  readOnly,
  progressBarStyle,
}: {
  bookmarkId: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly: boolean;
  progressBarStyle?: React.CSSProperties;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId,
    }),
  );
  // Fetch the full bookmark so we can branch the empty-cachedContent fallback
  // by URL pattern (X tweets, YouTube videos, etc.) instead of always showing
  // a generic "no readable content" icon.
  const { data: bookmarkData, isPending: isCachedContentLoading } = useQuery(
    api.bookmarks.getBookmark.queryOptions({
      bookmarkId,
      includeContent: true,
    }),
  );
  const cachedContent =
    bookmarkData?.content.type === BookmarkTypes.LINK
      ? bookmarkData.content.htmlContent
      : null;
  const linkContent =
    bookmarkData?.content.type === BookmarkTypes.LINK
      ? bookmarkData.content
      : null;

  const {
    showBanner,
    bannerPercent,
    onContinue,
    onDismiss,
    restorePosition,
    readingProgressOffset,
    readingProgressAnchor,
    onSavePosition,
    onScrollPositionChange,
  } = useReadingProgress({
    bookmarkId,
  });

  const { mutate: createHighlight } = useCreateHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been created!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  const { mutate: updateHighlight } = useUpdateHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been updated!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  const { mutate: deleteHighlight } = useDeleteHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been deleted!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  let content;
  if (isCachedContentLoading) {
    content = <FullPageSpinner />;
  } else if (!cachedContent) {
    // Smarter fallback: embed X tweets / YouTube videos when URL matches,
    // else show screenshot/imageAsset, else a calm "preparing…" placeholder
    // (replaces the alarming FileX icon).
    content = linkContent ? (
      <LinkPreviewFallback link={linkContent} />
    ) : (
      <div className="flex h-full w-full items-center justify-center p-4">
        <p className="font-display text-[18px] italic text-[var(--fg-muted)]">
          preparing…
        </p>
      </div>
    );
  } else {
    content = (
      <ScrollProgressTracker
        onSavePosition={onSavePosition}
        onScrollPositionChange={onScrollPositionChange}
        restorePosition={restorePosition}
        readingProgressOffset={readingProgressOffset}
        readingProgressAnchor={readingProgressAnchor}
        showProgressBar
        progressBarStyle={progressBarStyle}
      >
        {showBanner && (
          <ReadingProgressBanner
            percent={bannerPercent}
            onContinue={onContinue}
            onDismiss={onDismiss}
          />
        )}
        <BookmarkHTMLHighlighter
          className={className}
          style={style}
          htmlContent={cachedContent || ""}
          highlights={highlights?.highlights ?? []}
          readOnly={readOnly}
          onDeleteHighlight={(h) =>
            deleteHighlight({
              highlightId: h.id,
            })
          }
          onUpdateHighlight={(h) =>
            updateHighlight({
              highlightId: h.id,
              color: h.color,
              note: h.note,
            })
          }
          onHighlight={(h) =>
            createHighlight({
              startOffset: h.startOffset,
              endOffset: h.endOffset,
              color: h.color,
              bookmarkId,
              text: h.text,
              note: h.note ?? null,
            })
          }
        />
      </ScrollProgressTracker>
    );
  }
  return content;
}
