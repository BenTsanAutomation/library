"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useLibraryUIStore } from "@/lib/store/useLibraryUIStore";
import { cn } from "@/lib/utils";
import { ListPlus } from "lucide-react";

import { useCreateBookmarkWithPostHook } from "@library/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@library/shared/types/bookmarks";

import { EditListModal } from "@/components/dashboard/lists/EditListModal";

function looksLikeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function InlineComposer() {
  const composerOpen = useLibraryUIStore((state) => state.composerOpen);
  const setComposerOpen = useLibraryUIStore((state) => state.setComposerOpen);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending } = useCreateBookmarkWithPostHook({
    onSuccess: () => {
      setValue("");
      setComposerOpen(false);
    },
    onError: (error) => {
      toast({ description: error.message, variant: "destructive" });
    },
  });

  const submit = () => {
    const nextValue = value.trim();
    if (!nextValue) return;

    if (looksLikeUrl(nextValue)) {
      mutate({ type: BookmarkTypes.LINK, url: nextValue, source: "web" });
      return;
    }

    mutate({ type: BookmarkTypes.TEXT, text: nextValue, source: "web" });
  };

  useEffect(() => {
    if (!composerOpen) return;
    inputRef.current?.focus();
  }, [composerOpen]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape") {
      setComposerOpen(false);
    }
  };

  return (
    <div
      className={cn(
        "overflow-hidden transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)]",
        composerOpen
          ? "max-h-48 translate-y-0 opacity-100"
          : "max-h-0 -translate-y-4 opacity-0",
      )}
    >
      <div className="mt-4 rounded-[1.5rem] border border-border/60 bg-[var(--bg-surface)] px-4 py-4 shadow-[0_12px_30px_rgba(70,58,42,0.05)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">
              Quick save
            </p>
            <p className="mt-1 text-sm text-[var(--fg-secondary)]">
              Paste a link, write a note, or create a list.
            </p>
          </div>
          <EditListModal>
            <Button
              type="button"
              size="sm"
              data-testid="composer-create-list"
              className="library-cta-button h-9 gap-1.5 px-3 text-xs font-semibold"
              onClick={() => setComposerOpen(false)}
            >
              <ListPlus className="size-3.5" />
              Create a list
            </Button>
          </EditListModal>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display text-xl italic text-[var(--fg-primary)]">+</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Save a link or write a note"
            className="h-11 flex-1 bg-transparent text-[15px] text-[var(--fg-primary)] outline-none placeholder:text-[var(--fg-muted)]"
          />
          <ActionButton
            type="button"
            variant="secondary"
            loading={isPending}
            onClick={submit}
            className="library-inline-save-button"
          >
            Save
          </ActionButton>
        </div>
        <div className="mt-3 border-t border-border/40 pt-3 text-xs text-[var(--fg-muted)]">
          Use the button above if you want to organize things before saving.
        </div>
      </div>
    </div>
  );
}
