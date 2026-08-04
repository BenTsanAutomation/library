"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToggleTheme } from "@/components/theme-provider";
import { useReaderSettings } from "@/lib/readerSettings";
import { useUpdateBookmark } from "@library/shared-react/hooks/bookmarks";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MoonStar, Plus, Star } from "lucide-react";

import type { ZBookmark } from "@library/shared/types/bookmarks";

export default function ReaderChrome({ bookmark }: { bookmark: ZBookmark }) {
  const router = useRouter();
  const toggleTheme = useToggleTheme();
  const { settings, saveToServer } = useReaderSettings();
  const { mutate: updateBookmark } = useUpdateBookmark();

  const nextSmaller = useMemo(() => Math.max(12, settings.fontSize - 1), [settings.fontSize]);
  const nextLarger = useMemo(() => Math.min(24, settings.fontSize + 1), [settings.fontSize]);

  return (
    <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--fg-faint)] bg-[var(--bg-surface)]/95 px-3 py-2 shadow-[0_16px_32px_rgba(22,18,14,0.12)] backdrop-blur">
      <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Back">
        <ArrowLeft className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() =>
          updateBookmark({
            bookmarkId: bookmark.id,
            favourited: !bookmark.favourited,
          })
        }
        aria-label="Pin bookmark"
      >
        <Star className="size-4" fill={bookmark.favourited ? "currentColor" : "none"} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => saveToServer({ fontSize: nextSmaller })}
        aria-label="Decrease reader font size"
      >
        <span className="text-sm">A−</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => saveToServer({ fontSize: nextLarger })}
        aria-label="Increase reader font size"
      >
        <span className="text-sm">A+</span>
      </Button>
      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
        <MoonStar className="size-4" />
      </Button>
    </div>
  );
}
