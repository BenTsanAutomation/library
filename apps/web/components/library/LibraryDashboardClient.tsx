"use client";

import InlineComposer from "@/components/library/InlineComposer";
import TopOfMindStrip from "@/components/library/TopOfMindStrip";

import type { ZBookmark } from "@library/shared/types/bookmarks";

export default function LibraryDashboardClient({
  topOfMind,
  serendipity: _serendipity,
  userId: _userId,
  children,
}: {
  topOfMind: ZBookmark[];
  serendipity: ZBookmark[];
  userId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <InlineComposer />
      <TopOfMindStrip bookmarks={topOfMind} />
      {children}
    </div>
  );
}
