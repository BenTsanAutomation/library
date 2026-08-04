import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@library/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@library/shared/types/bookmarks";
import { getBookmarkRefreshInterval } from "@library/shared/utils/bookmarkUtils";

import AssetCard from "./AssetCard";
import LinkCard from "./LinkCard";
import TextCard from "./TextCard";
import UnknownCard from "./UnknownCard";

export default function BookmarkCard({
  bookmark: initialData,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const api = useTRPC();
  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId: initialData.id,
      },
      {
        initialData,
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data) {
            return false;
          }
          return getBookmarkRefreshInterval(data);
        },
      },
    ),
  );

  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      return (
        <LinkCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
    case BookmarkTypes.TEXT:
      return (
        <TextCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
    case BookmarkTypes.ASSET:
      return (
        <AssetCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
    case BookmarkTypes.UNKNOWN:
      return <UnknownCard className={className} bookmark={bookmark} />;
  }
}
