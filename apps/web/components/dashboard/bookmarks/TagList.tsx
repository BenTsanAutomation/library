import Link from "next/link";
import { badgeVariants } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

import type { ZBookmark } from "@library/shared/types/bookmarks";

export default function TagList({
  bookmark,
  loading,
  className,
}: {
  bookmark: ZBookmark;
  loading?: boolean;
  className?: string;
}) {
  const { data: session } = useSession();
  const isOwner = session?.user?.id === bookmark.userId;

  if (loading) {
    return (
      <div className="flex w-full flex-col justify-end space-y-2 p-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }
  return (
    <>
      {bookmark.tags.map((t) => (
        <div key={t.id} className={className}>
          {isOwner ? (
            <Link
              key={t.id}
              className={cn(
                badgeVariants({ variant: "secondary" }),
                "text-nowrap border-[color:var(--fg-faint)] bg-[color:var(--bg-elevated)] font-medium text-[color:var(--fg-secondary)] hover:bg-[color:var(--fg-primary)] hover:text-[color:var(--bg-base)] dark:bg-[color:var(--bg-elevated)] dark:text-[color:var(--fg-primary)]",
              )}
              href={`/dashboard/tags/${t.id}`}
            >
              {t.name}
            </Link>
          ) : (
            <span
              key={t.id}
              className={cn(
                badgeVariants({ variant: "secondary" }),
                "text-nowrap border-[color:var(--fg-faint)] bg-[color:var(--bg-elevated)] font-medium text-[color:var(--fg-secondary)] dark:bg-[color:var(--bg-elevated)] dark:text-[color:var(--fg-primary)]",
              )}
            >
              {t.name}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
