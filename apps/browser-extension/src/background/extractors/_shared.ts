/**
 * Shared helpers used by the per-platform extractors (reddit/twitter/youtube).
 *
 * Why this file (not strictly per-platform):
 *   The three extractors all do the same three things — read the user's saved
 *   Library credentials, POST a bookmark to /api/v1/bookmarks, and surface a
 *   chrome.notifications toast. Duplicating ~30 LOC three times is the kind
 *   of churn we explicitly want to avoid; one tiny shared module keeps every
 *   extractor focused on its parsing logic.
 */

import { getPluginSettings } from "../../utils/settings";

export interface ExtensionAuth {
  apiBase: string;
  apiKey: string;
  customHeaders: Record<string, string>;
}

export interface NewLinkBookmark {
  type: "link";
  url: string;
  title?: string;
  note?: string;
  source?: string;
}

interface CreateBookmarkResponse {
  id: string;
  alreadyExists?: boolean;
}

const NOTIFICATION_ICON_PATH = "public/logo-128.png";

/**
 * Read API base + key from extension settings. Returns null when the user
 * has not yet configured the extension (we cannot save without auth).
 */
export async function getAuth(): Promise<ExtensionAuth | null> {
  const settings = await getPluginSettings();
  if (!settings.apiKey || !settings.address) return null;
  return {
    apiBase: settings.address.replace(/\/+$/, ""),
    apiKey: settings.apiKey,
    customHeaders: settings.customHeaders ?? {},
  };
}

export async function postBookmark(
  auth: ExtensionAuth,
  payload: NewLinkBookmark,
): Promise<CreateBookmarkResponse> {
  const res = await fetch(`${auth.apiBase}/api/v1/bookmarks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.apiKey}`,
      ...auth.customHeaders,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Library API ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as CreateBookmarkResponse;
}

export async function attachTags(
  auth: ExtensionAuth,
  bookmarkId: string,
  tagNames: string[],
): Promise<void> {
  const filtered = tagNames.filter((t) => !!t && t.length <= 60);
  if (filtered.length === 0) return;
  try {
    await fetch(`${auth.apiBase}/api/v1/bookmarks/${bookmarkId}/tags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.apiKey}`,
        ...auth.customHeaders,
      },
      body: JSON.stringify({
        tags: filtered.map((tagName) => ({ tagName, attachedBy: "human" })),
      }),
    });
  } catch (err) {
    // Tag attachment is best-effort — the bookmark itself is already saved.
    console.warn("Library: tag attach failed", err);
  }
}

export function notify(title: string, message: string): void {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON_PATH),
      title,
      message: message.slice(0, 250) || "",
    });
  } catch (err) {
    console.warn("Library: notification failed", err);
  }
}

export function notifyError(prefix: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Library: ${prefix}`, err);
  notify(`Library: ${prefix} failed`, msg);
}

/**
 * Truncate text safely on a word boundary when possible.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
}
