import React from "react";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import LibraryDashboardClient from "@/components/library/LibraryDashboardClient";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";

export default async function BookmarksPage() {
  const session = await getServerAuthSession();
  if (!session) {
    return null;
  }

  const [topOfMind, serendipity] = await Promise.all([
    api.bookmarks.getBookmarks({
      archived: false,
      favourited: true,
      limit: 7,
    }),
    api.bookmarks.getSerendipity({ count: 3, windowDays: 90 }),
  ]);

  return (
    <LibraryDashboardClient
      topOfMind={topOfMind.bookmarks}
      serendipity={serendipity.bookmarks}
      userId={session.user.id}
    >
      <Bookmarks query={{ archived: false }} showEditorCard={true} />
    </LibraryDashboardClient>
  );
}
