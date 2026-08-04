import type { SubmitErrorHandler, SubmitHandler } from "react-hook-form";
import React, { useImperativeHandle, useRef } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormItem } from "@/components/ui/form";
import { Kbd } from "@/components/ui/kbd";
import MultipleChoiceDialog from "@/components/ui/multiple-choice-dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import BookmarkAlreadyExistsToast from "@/components/utils/BookmarkAlreadyExistsToast";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import {
  useBookmarkLayout,
  useBookmarkLayoutSwitch,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { cn, getOS } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { useHotkeys } from "react-hotkeys-hook";
import { z } from "zod";

import {
  useCreateBookmarkWithPostHook,
} from "@library/shared-react/hooks/bookmarks";
import { useAddBookmarkToList } from "@library/shared-react/hooks/lists";
import { BookmarkTypes } from "@library/shared/types/bookmarks";

import { EditListModal } from "../lists/EditListModal";
import { BookmarkListSelector } from "../lists/BookmarkListSelector";
import { useUploadAsset } from "../UploadDropzone";

interface MultiUrlImportState {
  urls: URL[];
  text: string;
}

export default function EditorCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [multiUrlImportState, setMultiUrlImportState] =
    React.useState<MultiUrlImportState | null>(null);
  // Optional list to drop the next save into. Reset to null after each
  // submit so saves don't keep pinning to a stale selection.
  const [pendingListId, setPendingListId] = React.useState<string | null>(null);

  const demoMode = !!useClientConfig().demoMode;
  const bookmarkLayout = useBookmarkLayout();
  const formSchema = z.object({
    text: z.string(),
  });
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      text: "",
    },
  });
  const { ref, ...textFieldProps } = form.register("text");
  useImperativeHandle(ref, () => inputRef.current);
  useHotkeys("mod+e", () => {
    inputRef.current?.focus();
  });

  const { mutateAsync: addBookmarkToList } = useAddBookmarkToList();
  const { mutate, isPending } = useCreateBookmarkWithPostHook({
    onSuccess: async (resp) => {
      if (resp.alreadyExists) {
        toast({
          description: <BookmarkAlreadyExistsToast bookmarkId={resp.id} />,
          variant: "default",
        });
      }
      // If the user picked a list in the quick-save header, attach the new
      // bookmark to it. Best-effort — the save itself already succeeded, so
      // surface a non-blocking error if attach fails.
      if (pendingListId && resp.id) {
        try {
          await addBookmarkToList({
            bookmarkId: resp.id,
            listId: pendingListId,
          });
        } catch (err) {
          toast({
            description: `Saved, but couldn't add to list: ${err instanceof Error ? err.message : String(err)}`,
            variant: "destructive",
          });
        }
      }
      form.reset();
      setPendingListId(null);
      // if the list layout is used, we reset the size of the editor card to the original size after submitting
      if (bookmarkLayout === "list" && inputRef?.current?.style) {
        inputRef.current.style.height = "auto";
      }
    },
    onError: (e) => {
      toast({ description: e.message, variant: "destructive" });
    },
  });

  const uploadAsset = useUploadAsset();

  function tryToImportUrls(text: string): void {
    const lines = text.split("\n");
    const urls: URL[] = [];
    for (const line of lines) {
      // parsing can also throw an exception, but will be caught outside
      const url = new URL(line);
      if (url.protocol != "http:" && url.protocol != "https:") {
        throw new Error("Invalid URL");
      }
      urls.push(url);
    }

    if (urls.length === 1) {
      // Only 1 url in the textfield --> simply import it
      mutate({ type: BookmarkTypes.LINK, url: text });
      return;
    }
    // multiple urls found --> ask the user if it should be imported as multiple URLs or as a text bookmark
    setMultiUrlImportState({ urls, text });
  }

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    // Expand the textarea to a max of half the screen size in the list layout only
    if (bookmarkLayout === "list") {
      const target = e.target as HTMLTextAreaElement;
      const maxHeight = window.innerHeight * 0.5;
      target.style.height = "auto";

      if (target.scrollHeight <= maxHeight) {
        target.style.height = `${target.scrollHeight}px`;
      } else {
        target.style.height = `${maxHeight}px`;
      }
    }
  };

  const onSubmit: SubmitHandler<z.infer<typeof formSchema>> = (data) => {
    const text = data.text.trim();
    if (!text.length) return;
    try {
      tryToImportUrls(text);
    } catch {
      // Not a URL
      mutate({ type: BookmarkTypes.TEXT, text });
    }
  };

  const onError: SubmitErrorHandler<z.infer<typeof formSchema>> = (errors) => {
    toast({
      description: Object.values(errors)
        .map((v) => v.message)
        .join("\n"),
      variant: "destructive",
    });
  };
  // Fixed `h-48` clipped the Save button in masonry layout (title + textarea +
  // button + padding > 192px). Use a min-height so the card has presence but
  // grows with content instead of cropping the action button.
  const cardHeight = useBookmarkLayoutSwitch({
    grid: "h-96",
    masonry: "min-h-[16rem]",
    list: undefined,
    compact: undefined,
  });

  const handlePaste = async (
    event: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event?.clipboardData?.items) {
      await Promise.all(
        Array.from(event.clipboardData.items)
          .filter((item) => item?.type?.startsWith("image"))
          .map((item) => {
            const blob = item.getAsFile();
            if (blob) {
              return uploadAsset(blob);
            }
          }),
      );
    }
  };

  /**
   * Methods that triggers when "enter" is pressed (without ctrl)
   * It checks if the current line is a todo
   * if it is it automatically appends a todo a the start of the new line
   */
  const handleNewTodo = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const todoMarkup = "- [ ] ";
    const textarea = inputRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const textBefore = textarea.value.slice(0, start);
    const lines = textBefore.split("\n");
    const currentLine = lines[lines.length - 1];
    const currentLineIsTodo = currentLine.startsWith(todoMarkup);
    if (!currentLineIsTodo) return;
    e.preventDefault();
    const newValue =
      textarea.value.slice(0, start) +
      "\n" +
      todoMarkup +
      textarea.value.slice(end);
    form.setValue("text", newValue, { shouldDirty: true, shouldTouch: true });
    textarea.value = newValue;
    textarea.selectionStart = start + todoMarkup.length + 1;
    textarea.selectionEnd = start + todoMarkup.length + 1;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const OS = getOS();

  return (
    <Form {...form}>
      <form
        className={cn(
          className,
          "library-quick-save relative flex flex-col gap-3 rounded-[1.5rem] bg-[linear-gradient(180deg,rgba(252,249,244,0.98)_0%,rgba(255,255,255,0.98)_100%)] p-5",
          cardHeight,
        )}
        onSubmit={form.handleSubmit(onSubmit, onError)}
      >
        <div className="flex justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Library quick save
            </p>
            <p className="mt-1 text-sm text-foreground">{t("editor.new_item")}</p>
          </div>
          <div className="flex items-center gap-2">
            <EditListModal>
              <Button
                type="button"
                size="sm"
                className="library-cta-button h-8 px-3 text-xs font-medium"
                title="Create a new list"
              >
                <Plus className="mr-1 size-3.5" />
                Make list
              </Button>
            </EditListModal>
            <Kbd>⌘ + E</Kbd>
          </div>
        </div>
        <Separator />
        <FormItem className="flex-1">
          <FormControl>
            <Textarea
              ref={inputRef}
              disabled={isPending}
              className={cn(
                "text-md h-full w-full border-none bg-transparent p-0 font-light focus-visible:ring-0",
                { "resize-none": bookmarkLayout !== "list" },
              )}
              placeholder={t("editor.placeholder_v2")}
              onKeyDown={(e) => {
                if (demoMode) {
                  return;
                }
                if (
                  e.key === "Enter" &&
                  !(e.metaKey || e.ctrlKey || e.shiftKey)
                ) {
                  handleNewTodo(e);
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  form.handleSubmit(onSubmit, onError)();
                }
              }}
              onPaste={(e) => {
                if (demoMode) {
                  return;
                }
                handlePaste(e);
              }}
              onInput={onInput}
              {...textFieldProps}
            />
          </FormControl>
        </FormItem>
        <div className="flex flex-col gap-2">
          <BookmarkListSelector
            value={pendingListId}
            onChange={(id) => setPendingListId(id)}
            placeholder="Save to a list (optional)"
            listTypes={["manual"]}
            className="w-full text-xs"
          />
          <ActionButton
            disabled={!form.formState.dirtyFields.text}
            loading={isPending}
            type="submit"
            variant="secondary"
          >
            {form.formState.dirtyFields.text
              ? demoMode
                ? t("editor.disabled_submissions")
                : `${t("actions.save")} (${OS === "macos" ? "⌘" : "Ctrl"} + Enter)`
              : t("actions.save")}
          </ActionButton>
        </div>

        {multiUrlImportState && (
          <MultipleChoiceDialog
            open={true}
            title={t("editor.multiple_urls_dialog_title")}
            description={t("editor.multiple_urls_dialog_desc")}
            onOpenChange={(open) => {
              if (!open) {
                setMultiUrlImportState(null);
              }
            }}
            actionButtons={[
              () => (
                <ActionButton
                  type="button"
                  variant="secondary"
                  loading={isPending}
                  onClick={() => {
                    mutate({
                      type: BookmarkTypes.TEXT,
                      text: multiUrlImportState.text,
                    });
                    setMultiUrlImportState(null);
                  }}
                >
                  {t("editor.import_as_text")}
                </ActionButton>
              ),
              () => (
                <ActionButton
                  type="button"
                  variant="destructive"
                  loading={isPending}
                  onClick={() => {
                    multiUrlImportState.urls.forEach((url) =>
                      mutate({ type: BookmarkTypes.LINK, url: url.toString() }),
                    );
                    setMultiUrlImportState(null);
                  }}
                >
                  {t("editor.import_as_separate_bookmarks")}
                </ActionButton>
              ),
            ]}
          ></MultipleChoiceDialog>
        )}
      </form>
    </Form>
  );
}
