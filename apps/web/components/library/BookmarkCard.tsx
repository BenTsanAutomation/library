"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@library/shared-react/trpc";
import {
  BookmarkTypes,
  ZBookmark,
  ZBookmarkContentType,
} from "@library/shared/types/bookmarks";
import { getBookmarkRefreshInterval } from "@library/shared/utils/bookmarkUtils";

import AssetCard from "../dashboard/bookmarks/AssetCard";
import LinkCard from "../dashboard/bookmarks/LinkCard";
import TextCard from "../dashboard/bookmarks/TextCard";
import UnknownCard from "../dashboard/bookmarks/UnknownCard";

const TYPE_COLOR: Record<ZBookmarkContentType, string> = {
  article: "var(--type-article)",
  product: "var(--type-product)",
  book: "var(--type-book)",
  recipe: "var(--type-recipe)",
  video: "var(--type-video)",
  note: "var(--type-note)",
  tweet: "var(--type-tweet)",
};

function inferContentType(b: ZBookmark): ZBookmarkContentType {
  if (b.contentType) return b.contentType;
  if (b.content.type === BookmarkTypes.LINK) return "article";
  if (b.content.type === BookmarkTypes.TEXT) return "note";
  return "note";
}

function TypeDot({ contentType }: { contentType: ZBookmarkContentType }) {
  return (
    <span
      aria-label={`${contentType} bookmark`}
      className="absolute left-3 top-3 z-10 h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: TYPE_COLOR[contentType] }}
    />
  );
}

export default function LibraryBookmarkCard({
  bookmark: initialData,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const api = useTRPC();
  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      { bookmarkId: initialData.id },
      {
        initialData,
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data) return false;
          return getBookmarkRefreshInterval(data);
        },
      },
    ),
  );

  const contentType = inferContentType(bookmark);
  const isNote = contentType === "note";

  const wrapperClass = [
    "relative",
    isNote ? "library-card-note" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  let inner: React.ReactNode;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      inner = (
        <LinkCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
      break;
    case BookmarkTypes.TEXT:
      inner = (
        <TextCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
      break;
    case BookmarkTypes.ASSET:
      inner = (
        <AssetCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
      break;
    case BookmarkTypes.UNKNOWN:
      inner = <UnknownCard className={className} bookmark={bookmark} />;
      break;
  }

  return (
    <div className={wrapperClass}>
      <TypeDot contentType={contentType} />
      {inner}
    </div>
  );
}
