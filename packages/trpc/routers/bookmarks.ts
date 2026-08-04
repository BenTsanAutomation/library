import { experimental_trpcMiddleware, TRPCError } from "@trpc/server";
import { and, eq, gt, inArray, like, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { ZBookmarkContent } from "@library/shared/types/bookmarks";
import type { ZBookmarkTags } from "@library/shared/types/tags";
import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  bookmarkTags,
  bookmarkTexts,
  customPrompts,
  tagsOnBookmarks,
  userReadingProgress,
  users,
} from "@library/db/schema";
import {
  AssetPreprocessingQueue,
  buildCrawlIdempotencyKey,
  LinkCrawlerQueue,
  LowPriorityCrawlerQueue,
  addLogFields,
  logEvent,
  OpenAIQueue,
  QueuePriority,
  QuotaService,
  triggerSearchReindex,
} from "@library/shared-server";
import { SUPPORTED_BOOKMARK_ASSET_TYPES } from "@library/shared/assetdb";
import serverConfig from "@library/shared/config";
import { bookmarkCreationCounter } from "../stats";
import { InferenceClientFactory } from "@library/shared/inference";
import { buildSummaryPrompt } from "@library/shared/prompts.server";
import { EnqueueOptions } from "@library/shared/queueing";
import { getRateLimitClient } from "@library/shared/ratelimiting";
import { FilterQuery, getSearchClient } from "@library/shared/search";
import { parseSearchQuery } from "@library/shared/searchQueryParser";
import {
  BookmarkTypes,
  DEFAULT_NUM_BOOKMARKS_PER_PAGE,
  zBookmarkSchema,
  zGetBookmarksRequestSchema,
  zGetBookmarksResponseSchema,
  zManipulatedTagSchema,
  zNewBookmarkRequestSchema,
  zSearchBookmarksCursor,
  zSearchBookmarksRequestSchema,
  zUpdateBookmarksRequestSchema,
} from "@library/shared/types/bookmarks";
import { ANCHOR_TEXT_MAX_LENGTH } from "@library/shared/utils/reading-progress-dom";
import { normalizeTagName } from "@library/shared/utils/tag";

import type { AuthedContext } from "../index";
import {
  createEventLogMiddleware,
  createRateLimitMiddleware,
  createScopedAuthedProcedure,
  emitRateLimitedEvent,
  router,
} from "../index";
import { RuleEngine } from "../lib/ruleEngine";
import { getBookmarkIdsFromMatcher } from "../lib/search";
import { Asset } from "../models/assets";
import { BareBookmark, Bookmark } from "../models/bookmarks";
import { WebhooksService } from "../models/webhooks.service";

const bookmarksProcedure = createScopedAuthedProcedure("bookmarks");

export const ensureBookmarkOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { bookmarkId: string };
}>().create(async (opts) => {
  const bookmark = await BareBookmark.bareFromId(
    opts.ctx,
    opts.input.bookmarkId,
  );
  bookmark.ensureOwnership();

  return opts.next({
    ctx: {
      ...opts.ctx,
      bookmark,
    },
  });
});

export const ensureBookmarkAccess = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { bookmarkId: string };
}>().create(async (opts) => {
  // Throws if bookmark doesn't exist or user doesn't have access
  const bookmark = await BareBookmark.bareFromId(
    opts.ctx,
    opts.input.bookmarkId,
  );

  return opts.next({
    ctx: {
      ...opts.ctx,
      bookmark,
    },
  });
});

/**
 * Per-platform pre-fetch. JS-rendered social platforms (X, Bluesky, Instagram,
 * Threads, LinkedIn) actively block Library's headless-Chromium crawler and
 * either return empty pages or "loading" stubs that contain garbage og:images
 * (e.g. X serves the U+26A0 ⚠ emoji as og:image when scraped). This dispatcher
 * detects the platform and runs the best available extraction:
 *   X / Twitter → publish.twitter.com/oembed (auth-free, full content)
 *   Bluesky    → public.api.bsky.app AT Protocol (auth-free, full content)
 *   Instagram  → URL-based title + clear bad imageUrl (no public API; iframe
 *                preview lives in apps/web LinkPreviewFallback)
 *   Threads    → same as Instagram
 *   LinkedIn   → URL-based title + clear bad imageUrl
 *
 * After ANY successful prefetch we re-enqueue the AI tag job — the generic
 * crawler's garbage content would otherwise produce wrong / no tags.
 *
 * Returns true when the URL was recognized as a social platform (regardless of
 * whether the API actually returned data). The bookmark create flow uses this
 * to decide whether to skip the headless-Chromium crawler entirely — running
 * it would just race us and overwrite our prefetched htmlContent with the
 * platform's "ScriptLoadFailure" / "Something went wrong" page.
 */
export function isSocialPrefetchUrl(url: string): boolean {
  // Only platforms with a public, auth-free metadata API where prefetch is
  // strictly better than the headless-Chromium crawler.
  //
  // INTENTIONALLY EXCLUDED (let the crawler handle with real Chrome):
  //   - instagram.com / threads.net / facebook.com → no public API; the
  //     pages are JS-rendered SPAs that don't ship og:* tags in the SSR
  //     response, but a real Chrome instance renders them and the crawler
  //     extracts og:image (= reel first frame) + caption from the live DOM.
  //   - linkedin.com → same story (JS-gated).
  return (
    /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^/]+\/status\/\d+/i.test(url) ||
    /^https?:\/\/(?:[^/]+\.)?bsky\.app\/profile\/[^/]+\/post\/[a-z0-9]+/i.test(url) ||
    /^https?:\/\/(?:www\.|old\.|new\.|np\.)?reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+/i.test(url) ||
    /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts\/|watch\?v=)[A-Za-z0-9_-]{11}/i.test(url) ||
    /^https?:\/\/youtu\.be\/[A-Za-z0-9_-]{11}/i.test(url)
  );
}

async function prefetchSocialContent(
  ctx: AuthedContext,
  bookmarkId: string,
  url: string,
): Promise<void> {
  let updated = false;
  try {
    if (/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^/]+\/status\/\d+/i.test(url)) {
      updated = await prefetchTwitter(ctx, bookmarkId, url);
    } else if (/^https?:\/\/(?:[^/]+\.)?bsky\.app\/profile\/[^/]+\/post\/[a-z0-9]+/i.test(url)) {
      updated = await prefetchBluesky(ctx, bookmarkId, url);
    } else if (/^https?:\/\/(?:www\.|old\.|new\.|np\.)?reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+/i.test(url)) {
      updated = await prefetchReddit(ctx, bookmarkId, url);
    } else if (
      /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts\/|watch\?v=)[A-Za-z0-9_-]{11}/i.test(url) ||
      /^https?:\/\/youtu\.be\/[A-Za-z0-9_-]{11}/i.test(url)
    ) {
      updated = await prefetchYouTube(ctx, bookmarkId, url);
    }
    if (updated) {
      // Mirror crawlerWorker's post-crawl behavior: enqueue both AI tag AND
      // summarize jobs. Without this, social bookmarks silently skip summary
      // because the crawler (which normally fires both) is bypassed.
      const opts = {
        groupId: ctx.user.id,
        priority: QueuePriority.Default,
      };
      try {
        await OpenAIQueue.enqueue({ bookmarkId, type: "tag" }, opts);
      } catch {
        // Best effort
      }
      try {
        await OpenAIQueue.enqueue({ bookmarkId, type: "summarize" }, opts);
      } catch {
        // Best effort
      }
    }
  } catch (err) {
    console.warn(
      `[social-prefetch] ${url} → bookmark ${bookmarkId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

async function prefetchTwitter(
  ctx: AuthedContext,
  bookmarkId: string,
  url: string,
): Promise<boolean> {
  // Prefer Twitter's CDN syndication API (what react-tweet uses) — it returns
  // photos, video thumbnails, and the author profile image, none of which the
  // public oEmbed endpoint exposes anymore. Fall back to oEmbed if syndication
  // fails. Either path gives us real text for AI tagging + a thumbnail for the
  // dashboard card (the alternative is a blank white card).
  const m = url.match(/\/status\/(\d+)/);
  if (!m) return false;
  const tweetId = m[1];
  const synUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${tweetId.slice(-6)}`;
  let html: string | null = null;
  let description = "";
  let authorTitle: string | null = null;
  let imageUrl: string | null = null;

  try {
    const synRes = await fetch(synUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (synRes.ok) {
      const j = (await synRes.json()) as {
        text?: string;
        user?: {
          name?: string;
          screen_name?: string;
          profile_image_url_https?: string;
        };
        photos?: { url?: string }[];
        mediaDetails?: { type?: string; media_url_https?: string }[];
      };
      const text = j.text ?? "";
      const author =
        j.user?.screen_name ?? j.user?.name ?? "unknown";
      description = text.slice(0, 500);
      authorTitle = `@${author} on X`;
      // Prefer real photo > video thumbnail > author avatar (upsized).
      const photo = j.photos?.[0]?.url ?? null;
      const mediaThumb = j.mediaDetails?.[0]?.media_url_https ?? null;
      const avatar =
        j.user?.profile_image_url_https?.replace("_normal", "_400x400") ??
        null;
      imageUrl = photo ?? mediaThumb ?? avatar;
      html = `<blockquote class="library-x-post"><p>${escapeHtml(text)}</p><footer>— ${escapeHtml(j.user?.name ?? author)} (@${escapeHtml(author)}) on X</footer></blockquote>`;
    }
  } catch {
    // fall through to oEmbed
  }

  if (!html) {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true&hide_thread=false`;
    const res = await fetch(oembedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LibraryBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { author_name?: string; html?: string };
    if (!data.html) return false;
    html = data.html;
    description = stripHtml(data.html).slice(0, 500);
    if (data.author_name) authorTitle = `@${data.author_name} on X`;
  }

  await ctx.db
    .update(bookmarkLinks)
    .set({
      htmlContent: html,
      description,
      imageUrl,
      crawledAt: new Date(),
      crawlStatus: "success",
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
  if (authorTitle) {
    await ctx.db
      .update(bookmarks)
      .set({ title: authorTitle })
      .where(eq(bookmarks.id, bookmarkId));
  }
  return true;
}

async function prefetchBluesky(
  ctx: AuthedContext,
  bookmarkId: string,
  url: string,
): Promise<boolean> {
  // URL → at:// URI: bsky.app/profile/<handle>/post/<rkey> → at://<did>/app.bsky.feed.post/<rkey>
  const m = url.match(
    /bsky\.app\/profile\/([^/]+)\/post\/([a-z0-9]+)/i,
  );
  if (!m) return false;
  const [, handle, rkey] = m;
  // Resolve handle → DID
  const didRes = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!didRes.ok) return false;
  const { did } = (await didRes.json()) as { did?: string };
  if (!did) return false;
  const atUri = `at://${did}/app.bsky.feed.post/${rkey}`;
  const postRes = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(atUri)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!postRes.ok) return false;
  const data = (await postRes.json()) as {
    posts?: {
      record?: { text?: string; createdAt?: string };
      author?: { handle?: string; displayName?: string; avatar?: string };
      embed?: { images?: { fullsize?: string }[] };
    }[];
  };
  const post = data.posts?.[0];
  if (!post?.record?.text) return false;
  const text = post.record.text;
  const author =
    post.author?.displayName || post.author?.handle || "unknown";
  const firstImg = post.embed?.images?.[0]?.fullsize ?? null;
  // Render an embed-style blockquote so ReaderView shows the post inline.
  const html = `<blockquote class="library-bsky-post"><p>${escapeHtml(
    text,
  )}</p><footer>— @${escapeHtml(author)} on Bluesky</footer></blockquote>`;
  await ctx.db
    .update(bookmarkLinks)
    .set({
      htmlContent: html,
      description: text.slice(0, 500),
      imageUrl: firstImg,
      crawledAt: new Date(),
      crawlStatus: "success",
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
  await ctx.db
    .update(bookmarks)
    .set({ title: `@${author} on Bluesky` })
    .where(eq(bookmarks.id, bookmarkId));
  return true;
}

async function prefetchYouTube(
  ctx: AuthedContext,
  bookmarkId: string,
  url: string,
): Promise<boolean> {
  // Extract video ID from any of: /shorts/<id>, /watch?v=<id>, youtu.be/<id>
  let videoId: string | null = null;
  const shorts = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i);
  const watch = url.match(/youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i);
  const shortLink = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i);
  videoId = shorts?.[1] ?? watch?.[1] ?? shortLink?.[1] ?? null;
  if (!videoId) return false;

  // Step 1: free YouTube oEmbed for title + author + thumbnail. No API key.
  const oembedRes = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
    {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LibraryBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    },
  );
  let title: string | null = null;
  let author: string | null = null;
  let authorUrl: string | null = null;
  let oembedThumb: string | null = null;
  if (oembedRes.ok) {
    const j = (await oembedRes.json()) as {
      title?: string;
      author_name?: string;
      author_url?: string;
      thumbnail_url?: string;
    };
    title = j.title ?? null;
    author = j.author_name ?? null;
    authorUrl = j.author_url ?? null;
    oembedThumb = j.thumbnail_url ?? null;
  }
  if (!title) {
    // oEmbed failed (rare, age-restricted vids) — still useful to land
    // the high-res thumb URL since img.youtube.com always serves it.
    title = `YouTube video · ${videoId}`;
  }
  // Prefer the highest-resolution thumbnail. img.youtube.com ALWAYS serves
  // a 480p hqdefault; maxresdefault is only present for videos uploaded at
  // ≥1280px, so we use hqdefault as the safe default and let oembedThumb
  // win when present (it's the platform's chosen still).
  const imageUrl =
    oembedThumb ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const isShort = !!shorts;
  const html = `<article class="library-youtube-post"><header><p class="yt-meta">YouTube${isShort ? " Short" : ""}${author ? ` · ${escapeHtml(author)}` : ""}</p><h1>${escapeHtml(title)}</h1></header><p class="yt-watch">→ <a href="https://www.youtube.com/watch?v=${escapeHtml(videoId)}" target="_blank" rel="noreferrer">Watch on YouTube</a></p>${authorUrl ? `<p class="yt-channel"><a href="${escapeHtml(safeHref(authorUrl))}" target="_blank" rel="noreferrer">${escapeHtml(author ?? authorUrl)}'s channel</a></p>` : ""}</article>`;
  await ctx.db
    .update(bookmarkLinks)
    .set({
      htmlContent: html,
      description: `${title}${author ? ` — ${author}` : ""}`.slice(0, 500),
      imageUrl,
      author,
      publisher: "YouTube",
      crawledAt: new Date(),
      crawlStatus: "success",
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
  await ctx.db
    .update(bookmarks)
    .set({ title })
    .where(eq(bookmarks.id, bookmarkId));
  return true;
}

// Shape of the per-post `data` blob in Reddit's JSON listing.
// Permissive — any field may be missing depending on post type / mod state.
type RedditPostData = {
  title?: string;
  selftext?: string;
  selftext_html?: string;
  author?: string;
  subreddit_name_prefixed?: string;
  score?: number;
  num_comments?: number;
  thumbnail?: string;
  preview?: { images?: Array<{ source?: { url?: string } }> };
  url_overridden_by_dest?: string;
  is_self?: boolean;
  crosspost_parent_list?: RedditPostData[];
  permalink?: string;
};

function pickRedditImage(p: RedditPostData): string | null {
  const previewImg = p.preview?.images?.[0]?.source?.url ?? null;
  const directMedia =
    p.url_overridden_by_dest &&
    /\.(jpe?g|png|gif|webp)$/i.test(p.url_overridden_by_dest)
      ? p.url_overridden_by_dest
      : null;
  const thumb =
    p.thumbnail && /^https?:\/\//.test(p.thumbnail) ? p.thumbnail : null;
  return previewImg ?? directMedia ?? thumb ?? null;
}

function selftextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join("");
}

/**
 * Sanitize a URL before injecting it into an `href` attribute. The injected
 * HTML is later rendered via dangerouslySetInnerHTML in BookmarkHTMLHighlighter,
 * so a `javascript:` / `data:` / `vbscript:` URL would execute on click — even
 * after escapeHtml(), because escapeHtml() only neutralizes the angle-bracket
 * structure of the attribute, not its scheme. This guard keeps only http(s),
 * mailto, and Reddit-relative paths (the crosspost permalink case). Anything
 * else collapses to "#" so the link is inert.
 */
function safeHref(raw: string | null | undefined): string {
  if (!raw) return "#";
  const trimmed = raw.trim();
  if (trimmed.startsWith("/")) return trimmed; // relative path
  if (/^(https?|mailto):/i.test(trimmed)) return trimmed;
  return "#";
}

async function prefetchReddit(
  ctx: AuthedContext,
  bookmarkId: string,
  url: string,
): Promise<boolean> {
  // Reddit's public JSON API: append .json to any post URL. Returns
  // [postListing, commentListing]. For self posts the body is in selftext.
  // For crossposts the original post (with its real selftext + media) is
  // returned inline at crosspost_parent_list[0]. For link/image submissions
  // the destination is in url_overridden_by_dest and we surface it as a link.
  const m = url.match(/reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)/i);
  if (!m) return false;
  const cleanUrl = url.split("?")[0].split("#")[0].replace(/\/?$/, "/");
  const jsonUrl =
    cleanUrl.replace(/^https?:\/\/[^/]+/, "https://www.reddit.com") +
    ".json?raw_json=1";
  const res = await fetch(jsonUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LibraryBot/1.0; +https://library.example.com)",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as Array<{
    data?: { children?: Array<{ data?: RedditPostData }> };
  }>;
  const post = data?.[0]?.data?.children?.[0]?.data;
  if (!post?.title) return false;

  // Crossposts: the body lives on the parent. Use parent for content +
  // image, but keep the original post's title/sub/author/score for context.
  const parent = post.crosspost_parent_list?.[0];
  const contentSource = parent ?? post;
  const selftext = (contentSource.selftext ?? "").trim();
  const externalLink =
    contentSource.url_overridden_by_dest &&
    !/reddit\.com|redd\.it/i.test(contentSource.url_overridden_by_dest)
      ? contentSource.url_overridden_by_dest
      : null;
  const imageUrl = pickRedditImage(contentSource) ?? pickRedditImage(post);

  // Top-level comments — surface the highest-voted ones when there's no
  // body and no external link, so the preview is still informative.
  const comments =
    (data?.[1]?.data?.children
      ?.map((c) => c.data as RedditPostData & { body?: string })
      .filter((c) => c?.body && c.author && c.author !== "AutoModerator")
      .slice(0, 3) as Array<{
      body: string;
      author: string;
      score?: number;
    }>) ?? [];

  const subPrefixed = post.subreddit_name_prefixed ?? `r/${m[1]}`;
  const author = post.author ?? "unknown";

  let bodyHtml = "";
  if (selftext) {
    bodyHtml += selftextToHtml(selftext);
  }
  if (externalLink) {
    bodyHtml += `<p class="reddit-external">→ <a href="${escapeHtml(safeHref(externalLink))}" target="_blank" rel="noreferrer">${escapeHtml(externalLink)}</a></p>`;
  }
  if (parent && (parent.subreddit_name_prefixed || parent.permalink)) {
    // Reddit returns permalinks as relative paths like "/r/sub/comments/...".
    // safeHref() preserves the leading slash; we then prefix the domain.
    const safePerm = parent.permalink ? safeHref(parent.permalink) : "/";
    bodyHtml += `<p class="reddit-crosspost">Crossposted from <a href="https://www.reddit.com${escapeHtml(safePerm)}" target="_blank" rel="noreferrer">${escapeHtml(parent.subreddit_name_prefixed ?? "the original post")}</a></p>`;
  }
  if (!selftext && !externalLink && comments.length > 0) {
    bodyHtml +=
      `<section class="reddit-comments"><h2>Top comments</h2>` +
      comments
        .map(
          (c) =>
            `<blockquote><footer>u/${escapeHtml(c.author)}${typeof c.score === "number" ? ` · ${c.score}↑` : ""}</footer>${selftextToHtml(c.body)}</blockquote>`,
        )
        .join("") +
      `</section>`;
  }
  if (!bodyHtml) {
    // Truly empty post (no selftext, no link, no comments) — at least
    // show a permalink so the user can jump to the discussion.
    bodyHtml = `<p class="reddit-external">→ <a href="${escapeHtml(safeHref(url))}" target="_blank" rel="noreferrer">View on Reddit</a></p>`;
  }

  const html = `<article class="library-reddit-post"><header><p class="reddit-meta">${escapeHtml(subPrefixed)} · u/${escapeHtml(author)}${typeof post.score === "number" ? ` · ${post.score}↑` : ""}${typeof post.num_comments === "number" ? ` · ${post.num_comments} comments` : ""}</p><h1>${escapeHtml(post.title)}</h1></header>${bodyHtml}</article>`;

  // Description (used for AI tag/summary input + search). Prefer real
  // selftext, then external link description, then top comment, then title.
  const description =
    selftext ||
    (externalLink ? `Linked: ${externalLink}` : "") ||
    comments[0]?.body ||
    post.title;

  await ctx.db
    .update(bookmarkLinks)
    .set({
      htmlContent: html,
      description: description.slice(0, 500),
      imageUrl,
      crawledAt: new Date(),
      crawlStatus: "success",
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
  await ctx.db
    .update(bookmarks)
    .set({ title: `${post.title} — ${subPrefixed}` })
    .where(eq(bookmarks.id, bookmarkId));
  return true;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function attemptToDedupLink(ctx: AuthedContext, url: string) {
  // Skip archived bookmarks — when the user "deletes" (archives) a link they
  // expect to be able to re-save the same URL. The archived row stays in the
  // DB so it's restorable, but it shouldn't block a re-save.
  const result = await ctx.db
    .select({
      id: bookmarkLinks.id,
    })
    .from(bookmarkLinks)
    .leftJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
    .where(
      and(
        eq(bookmarkLinks.url, url),
        eq(bookmarks.userId, ctx.user.id),
        eq(bookmarks.archived, false),
      ),
    );

  if (result.length == 0) {
    return null;
  }
  return (
    await Bookmark.fromId(ctx, result[0].id, /* includeContent: */ false)
  ).asZBookmark();
}

const BOOKMARKS_QUERIED_WINDOW_MS = 10 * 60 * 1000;

function createBookmarksQueriedMiddleware<T>() {
  return async function bookmarksQueriedMiddleware(opts: {
    ctx: AuthedContext;
    next: () => Promise<T>;
  }) {
    emitRateLimitedEvent(
      "bookmarks.queried",
      `bookmarks.queried:${opts.ctx.user.id}`,
      BOOKMARKS_QUERIED_WINDOW_MS,
      { "user.id": opts.ctx.user.id },
    );
    return opts.next();
  };
}

function safeUrlHost(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

const highBookmarkCreationRateLimitConfig = {
  name: "bookmarks.createBookmark.highVolume",
  windowMs: 5 * 60 * 1000,
  maxRequests: 30,
} as const;

async function shouldUseLowPriorityQueues(
  ctx: AuthedContext,
): Promise<boolean> {
  if (!serverConfig.rateLimiting.enabled) {
    return false;
  }

  const rateLimitClient = await getRateLimitClient();
  if (!rateLimitClient) {
    return false;
  }

  try {
    const result = await rateLimitClient.checkRateLimit(
      highBookmarkCreationRateLimitConfig,
      ctx.user.id,
    );
    return !result.allowed;
  } catch {
    // Don't block bookmark creation if rate limiting is unavailable.
    return false;
  }
}

export const bookmarksAppRouter = router({
  createBookmark: bookmarksProcedure
    .use(
      createRateLimitMiddleware({
        name: "bookmarks.createBookmark",
        windowMs: 60 * 1000,
        maxRequests: 30,
      }),
    )
    .use(createEventLogMiddleware("bookmark.create"))
    .input(zNewBookmarkRequestSchema)
    .output(
      zBookmarkSchema.merge(
        z.object({
          alreadyExists: z.boolean().optional().default(false),
        }),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      addLogFields<"bookmark.create">({
        "bookmark.type": input.type,
        "bookmark.source": input.source ?? undefined,
        "bookmark.crawl_priority": input.crawlPriority,
        ...(input.type === BookmarkTypes.LINK
          ? {
              "bookmark.url": input.url,
              "bookmark.domain": safeUrlHost(input.url),
              "bookmark.has_precrawled": !!input.precrawledArchiveId,
            }
          : {}),
        ...(input.type === BookmarkTypes.ASSET
          ? { "bookmark.asset_type": input.assetType }
          : {}),
      });
      if (input.type == BookmarkTypes.LINK) {
        // This doesn't 100% protect from duplicates because of races, but it's more than enough for this usecase.
        const alreadyExists = await attemptToDedupLink(ctx, input.url);
        if (alreadyExists) {
          addLogFields<"bookmark.create">({
            "bookmark.id": alreadyExists.id,
            "bookmark.already_existed": true,
          });
          return { ...alreadyExists, alreadyExists: true };
        }
      }

      const bookmark = await ctx.db.transaction(
        async (tx) => {
          // Check user quota
          const quotaResult = await QuotaService.canCreateBookmark(
            tx,
            ctx.user.id,
          );
          if (!quotaResult.result) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: quotaResult.error,
            });
          }
          const bookmark = (
            await tx
              .insert(bookmarks)
              .values({
                userId: ctx.user.id,
                title: input.title,
                type: input.type,
                archived: input.archived,
                favourited: input.favourited,
                note: input.note,
                summary: input.summary,
                createdAt: input.createdAt,
                source: input.source,
                contentType: input.type === BookmarkTypes.TEXT ? "note" : "note",
                // Only links currently support summarization. Let's set the status to null for other types for now.
                summarizationStatus:
                  input.type === BookmarkTypes.LINK ? "pending" : null,
              })
              .returning()
          )[0];

          let content: ZBookmarkContent;

          switch (input.type) {
            case BookmarkTypes.LINK: {
              const link = (
                await tx
                  .insert(bookmarkLinks)
                  .values({
                    id: bookmark.id,
                    url: input.url.trim(),
                  })
                  .returning()
              )[0];
              if (input.precrawledArchiveId) {
                await Asset.ensureOwnership(ctx, input.precrawledArchiveId);
                await tx
                  .update(assets)
                  .set({
                    bookmarkId: bookmark.id,
                    assetType: AssetTypes.LINK_PRECRAWLED_ARCHIVE,
                  })
                  .where(
                    and(
                      eq(assets.id, input.precrawledArchiveId),
                      eq(assets.userId, ctx.user.id),
                    ),
                  );
              }
              content = {
                type: BookmarkTypes.LINK,
                ...link,
              };
              break;
            }
            case BookmarkTypes.TEXT: {
              const text = (
                await tx
                  .insert(bookmarkTexts)
                  .values({
                    id: bookmark.id,
                    text: input.text,
                    sourceUrl: input.sourceUrl,
                  })
                  .returning()
              )[0];
              content = {
                type: BookmarkTypes.TEXT,
                text: text.text ?? "",
                sourceUrl: text.sourceUrl,
              };
              break;
            }
            case BookmarkTypes.ASSET: {
              const [asset] = await tx
                .insert(bookmarkAssets)
                .values({
                  id: bookmark.id,
                  assetType: input.assetType,
                  assetId: input.assetId,
                  content: null,
                  metadata: null,
                  fileName: input.fileName ?? null,
                  sourceUrl: input.sourceUrl ?? null,
                })
                .returning();
              const uploadedAsset = await Asset.fromId(ctx, input.assetId);
              uploadedAsset.ensureOwnership();
              if (
                !uploadedAsset.asset.contentType ||
                !SUPPORTED_BOOKMARK_ASSET_TYPES.has(
                  uploadedAsset.asset.contentType,
                )
              ) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Unsupported asset type",
                });
              }
              await tx
                .update(assets)
                .set({
                  bookmarkId: bookmark.id,
                  assetType: AssetTypes.BOOKMARK_ASSET,
                })
                .where(
                  and(
                    eq(assets.id, input.assetId),
                    eq(assets.userId, ctx.user.id),
                  ),
                );
              content = {
                type: BookmarkTypes.ASSET,
                assetType: asset.assetType,
                assetId: asset.assetId,
                fileName: asset.fileName,
                sourceUrl: asset.sourceUrl,
              };
              break;
            }
          }

          return {
            alreadyExists: false,
            tags: [] as ZBookmarkTags[],
            assets: [],
            content,
            ...bookmark,
          };
        },
        {
          behavior: "immediate",
        },
      );

      bookmarkCreationCounter.labels(input.source ?? "unknown").inc();
      addLogFields<"bookmark.create">({
        "bookmark.id": bookmark.id,
        "bookmark.type": bookmark.content.type,
      });

      const forceLowPriority = await shouldUseLowPriorityQueues(ctx);
      const shouldUseLowPriority =
        input.crawlPriority === "low" || forceLowPriority;

      const enqueueOpts: EnqueueOptions = {
        // The lower the priority number, the sooner the job will be processed
        priority: shouldUseLowPriority
          ? QueuePriority.Low
          : QueuePriority.Default,
        groupId: ctx.user.id,
      };

      switch (bookmark.content.type) {
        case BookmarkTypes.LINK: {
          if (isSocialPrefetchUrl(bookmark.content.url)) {
            // Social platforms (X, Bluesky, IG, Threads, LinkedIn) block the
            // headless-Chromium crawler — running it would race the prefetch
            // and overwrite real content with the platform's "Something went
            // wrong" / "ScriptLoadFailure" page. Skip crawler, await prefetch
            // (so tag job fires on real content), then enqueue tagging.
            await prefetchSocialContent(ctx, bookmark.id, bookmark.content.url);
          } else {
            // The crawling job triggers openai when it's done.
            // Use a separate queue for low priority crawling to avoid
            // impacting main queue parallelism.
            const crawlerQueue = shouldUseLowPriority
              ? LowPriorityCrawlerQueue
              : LinkCrawlerQueue;
            await crawlerQueue.enqueue(
              { bookmarkId: bookmark.id },
              enqueueOpts,
            );
          }
          break;
        }
        case BookmarkTypes.TEXT: {
          await OpenAIQueue.enqueue(
            {
              bookmarkId: bookmark.id,
              type: "tag",
            },
            enqueueOpts,
          );
          // Mirror crawler/asset workers: also enqueue summarize so notes
          // get an automatic summary alongside auto-tagging.
          await OpenAIQueue.enqueue(
            {
              bookmarkId: bookmark.id,
              type: "summarize",
            },
            enqueueOpts,
          );
          break;
        }
        case BookmarkTypes.ASSET: {
          await AssetPreprocessingQueue.enqueue(
            {
              bookmarkId: bookmark.id,
              fixMode: false,
            },
            enqueueOpts,
          );
          break;
        }
      }

      await Promise.all([
        RuleEngine.triggerOnEvent(
          bookmark.userId,
          bookmark.id,
          [
            {
              type: "bookmarkAdded",
            },
          ],
          enqueueOpts,
          ctx.db,
        ),
        triggerSearchReindex(bookmark.id, enqueueOpts),
        new WebhooksService(ctx.db).triggerWebhook(
          bookmark.id,
          "created",
          bookmark.userId,
          enqueueOpts,
        ),
      ]);
      return bookmark;
    }),

  updateBookmark: bookmarksProcedure
    .input(zUpdateBookmarksRequestSchema)
    .output(zBookmarkSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.db.transaction(async (tx) => {
        let somethingChanged = false;

        // Update link-specific fields if any are provided
        const linkUpdateData: Partial<{
          url: string;
          description: string | null;
          author: string | null;
          publisher: string | null;
          datePublished: Date | null;
          dateModified: Date | null;
        }> = {};
        if (input.url) {
          linkUpdateData.url = input.url.trim();
        }
        if (input.description !== undefined) {
          linkUpdateData.description = input.description;
        }
        if (input.author !== undefined) {
          linkUpdateData.author = input.author;
        }
        if (input.publisher !== undefined) {
          linkUpdateData.publisher = input.publisher;
        }
        if (input.datePublished !== undefined) {
          linkUpdateData.datePublished = input.datePublished;
        }
        if (input.dateModified !== undefined) {
          linkUpdateData.dateModified = input.dateModified;
        }

        if (Object.keys(linkUpdateData).length > 0) {
          const result = await tx
            .update(bookmarkLinks)
            .set(linkUpdateData)
            .where(eq(bookmarkLinks.id, input.bookmarkId));
          if (result.changes == 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Attempting to set link attributes for non-link type bookmark",
            });
          }
          somethingChanged = true;
        }

        if (input.text) {
          const result = await tx
            .update(bookmarkTexts)
            .set({
              text: input.text,
            })
            .where(eq(bookmarkTexts.id, input.bookmarkId));

          if (result.changes == 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Attempting to set link attributes for non-text type bookmark",
            });
          }
          somethingChanged = true;
        }

        if (input.assetContent !== undefined) {
          const result = await tx
            .update(bookmarkAssets)
            .set({
              content: input.assetContent,
            })
            .where(and(eq(bookmarkAssets.id, input.bookmarkId)));

          if (result.changes == 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Attempting to set asset content for non-asset type bookmark",
            });
          }
          somethingChanged = true;
        }

        // Update common bookmark fields
        const commonUpdateData: Partial<{
          title: string | null;
          archived: boolean;
          favourited: boolean;
          note: string | null;
          summary: string | null;
          createdAt: Date;
          modifiedAt: Date; // Always update modifiedAt
        }> = {
          modifiedAt: new Date(),
        };
        if (input.title !== undefined) {
          commonUpdateData.title = input.title;
        }
        if (input.archived !== undefined) {
          commonUpdateData.archived = input.archived;
        }
        if (input.favourited !== undefined) {
          commonUpdateData.favourited = input.favourited;
        }
        if (input.note !== undefined) {
          commonUpdateData.note = input.note;
        }
        if (input.summary !== undefined) {
          commonUpdateData.summary = input.summary;
        }
        if (input.createdAt !== undefined) {
          commonUpdateData.createdAt = input.createdAt;
        }

        if (Object.keys(commonUpdateData).length > 1 || somethingChanged) {
          await tx
            .update(bookmarks)
            .set(commonUpdateData)
            .where(
              and(
                eq(bookmarks.userId, ctx.user.id),
                eq(bookmarks.id, input.bookmarkId),
              ),
            );
        }
      });

      // Refetch the updated bookmark data to return the full object
      const updatedBookmark = (
        await Bookmark.fromId(
          ctx,
          input.bookmarkId,
          /* includeContent: */ false,
        )
      ).asZBookmark();

      if (input.archived !== undefined) {
        logEvent({
          "event.name": "bookmark.archive",
          "bookmark.id": input.bookmarkId,
          "user.id": ctx.user.id,
          "bookmark.archived": input.archived,
        });
      }
      if (input.favourited !== undefined) {
        logEvent({
          "event.name": "bookmark.favorite",
          "bookmark.id": input.bookmarkId,
          "user.id": ctx.user.id,
          "bookmark.favorited": input.favourited,
        });
      }

      if (input.favourited === true || input.archived === true) {
        await RuleEngine.triggerOnEvent(
          updatedBookmark.userId,
          input.bookmarkId,
          [
            ...(input.favourited === true ? ["favourited" as const] : []),
            ...(input.archived === true ? ["archived" as const] : []),
          ].map((t) => ({
            type: t,
          })),
          undefined,
          ctx.db,
        );
      }
      await Promise.all([
        triggerSearchReindex(input.bookmarkId, {
          groupId: ctx.user.id,
        }),
        new WebhooksService(ctx.db).triggerWebhook(
          input.bookmarkId,
          "edited",
          updatedBookmark.userId,
          {
            groupId: ctx.user.id,
          },
        ),
      ]);

      return updatedBookmark;
    }),

  // DEPRECATED: use updateBookmark instead
  updateBookmarkText: bookmarksProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        text: z.string(),
      }),
    )
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.db.transaction(async (tx) => {
        const res = await tx
          .update(bookmarkTexts)
          .set({
            text: input.text,
          })
          .where(and(eq(bookmarkTexts.id, input.bookmarkId)))
          .returning();
        if (res.length == 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Bookmark not found",
          });
        }
        await tx
          .update(bookmarks)
          .set({ modifiedAt: new Date() })
          .where(
            and(
              eq(bookmarks.id, input.bookmarkId),
              eq(bookmarks.userId, ctx.user.id),
            ),
          );
      });
      await Promise.all([
        triggerSearchReindex(input.bookmarkId, {
          groupId: ctx.user.id,
        }),
        new WebhooksService(ctx.db).triggerWebhook(
          input.bookmarkId,
          "edited",
          ctx.bookmark.userId,
          {
            groupId: ctx.user.id,
          },
        ),
      ]);
    }),

  deleteBookmark: bookmarksProcedure
    .use(createEventLogMiddleware("bookmark.delete"))
    .input(z.object({ bookmarkId: z.string() }))
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      addLogFields<"bookmark.delete">({ "bookmark.id": input.bookmarkId });
      const bookmark = await Bookmark.fromId(ctx, input.bookmarkId, false);
      await bookmark.delete();
    }),
  recrawlBookmark: bookmarksProcedure
    .use(
      createRateLimitMiddleware({
        name: "bookmarks.recrawlBookmark",
        windowMs: 30 * 60 * 1000,
        maxRequests: 200,
      }),
    )
    .input(
      z.object({
        bookmarkId: z.string(),
        archiveFullPage: z.boolean().optional().default(false),
        storePdf: z.boolean().optional().default(false),
      }),
    )
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const payload = {
        bookmarkId: input.bookmarkId,
        archiveFullPage: input.archiveFullPage,
        storePdf: input.storePdf,
      };
      await LowPriorityCrawlerQueue.enqueue(payload, {
        groupId: ctx.user.id,
        priority: QueuePriority.Low,
        idempotencyKey: buildCrawlIdempotencyKey(payload),
      });
    }),
  updateReadingProgress: bookmarksProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        readingProgressOffset: z.number().int().nonnegative(),
        readingProgressAnchor: z.string().max(ANCHOR_TEXT_MAX_LENGTH).nullish(),
        readingProgressPercent: z.number().int().min(0).max(100).nullish(),
      }),
    )
    .use(ensureBookmarkAccess)
    .mutation(async ({ input, ctx }) => {
      // Validate this is a LINK bookmark - reading progress only applies to links
      const linkBookmark = await ctx.db.query.bookmarkLinks.findFirst({
        where: eq(bookmarkLinks.id, input.bookmarkId),
      });
      if (!linkBookmark) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reading progress can only be saved for link bookmarks",
        });
      }

      await ctx.db
        .insert(userReadingProgress)
        .values({
          bookmarkId: input.bookmarkId,
          userId: ctx.user.id,
          readingProgressOffset: input.readingProgressOffset,
          readingProgressAnchor: input.readingProgressAnchor ?? null,
          readingProgressPercent: input.readingProgressPercent ?? null,
        })
        .onConflictDoUpdate({
          target: [userReadingProgress.bookmarkId, userReadingProgress.userId],
          set: {
            readingProgressOffset: input.readingProgressOffset,
            readingProgressAnchor: input.readingProgressAnchor ?? null,
            readingProgressPercent: input.readingProgressPercent ?? null,
            modifiedAt: new Date(),
          },
        });
    }),
  getReadingProgress: bookmarksProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
      }),
    )
    .use(ensureBookmarkAccess)
    .query(async ({ input, ctx }) => {
      const progress = await ctx.db.query.userReadingProgress.findFirst({
        where: and(
          eq(userReadingProgress.bookmarkId, input.bookmarkId),
          eq(userReadingProgress.userId, ctx.user.id),
        ),
      });
      return {
        readingProgressOffset: progress?.readingProgressOffset ?? null,
        readingProgressAnchor: progress?.readingProgressAnchor ?? null,
        readingProgressPercent: progress?.readingProgressPercent ?? null,
      };
    }),
  getBookmark: bookmarksProcedure
    .use(createBookmarksQueriedMiddleware())
    .input(
      z.object({
        bookmarkId: z.string(),
        includeContent: z.boolean().optional().default(false),
      }),
    )
    .output(zBookmarkSchema)
    .use(ensureBookmarkAccess)
    .query(async ({ input, ctx }) => {
      return (
        await Bookmark.fromId(ctx, input.bookmarkId, input.includeContent)
      ).asZBookmark();
    }),
  searchBookmarks: bookmarksProcedure
    .use(createBookmarksQueriedMiddleware())
    .use(createEventLogMiddleware("search.query"))
    .input(zSearchBookmarksRequestSchema)
    .output(
      z.object({
        bookmarks: z.array(zBookmarkSchema),
        nextCursor: zSearchBookmarksCursor.nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      addLogFields<"search.query">({
        "search.has_query": input.text.length > 0,
      });
      if (!input.limit) {
        input.limit = DEFAULT_NUM_BOOKMARKS_PER_PAGE;
      }
      const sortOrder = input.sortOrder || "relevance";
      const client = await getSearchClient();
      if (!client) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Search functionality is not configured",
        });
      }
      const parsedQuery = parseSearchQuery(input.text);

      let filter: FilterQuery[];
      if (parsedQuery.matcher) {
        const bookmarkIds = await getBookmarkIdsFromMatcher(
          ctx,
          parsedQuery.matcher,
        );
        filter = [
          { type: "in", field: "id", values: bookmarkIds },
          { type: "eq", field: "userId", value: ctx.user.id },
        ];
      } else {
        filter = [{ type: "eq", field: "userId", value: ctx.user.id }];
      }

      /**
       * preserve legacy behaviour
       */
      const createdAtSortOrder = sortOrder === "relevance" ? "desc" : sortOrder;

      const resp = await client.search({
        query: parsedQuery.text,
        filter,
        sort: [{ field: "createdAt", order: createdAtSortOrder }],
        limit: input.limit,
        ...(input.cursor
          ? {
              offset: input.cursor.offset,
            }
          : {}),
      });

      addLogFields<"search.query">({
        "search.results_count": resp.totalHits,
      });

      if (resp.hits.length == 0) {
        return { bookmarks: [], nextCursor: null };
      }
      const idToRank = resp.hits.reduce<Record<string, number>>((acc, r) => {
        acc[r.id] = r.score || 0;
        return acc;
      }, {});

      const { bookmarks: results } = await Bookmark.loadMulti(ctx, {
        ids: resp.hits.map((h) => h.id),
        includeContent: input.includeContent,
        sortOrder: "desc", // Doesn't matter, we're sorting again afterwards and the list contain all data
      });

      switch (true) {
        case sortOrder === "relevance":
          results.sort((a, b) => idToRank[b.id] - idToRank[a.id]);
          break;
        case sortOrder === "desc":
          results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          break;
        case sortOrder === "asc":
          results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          break;
      }

      return {
        bookmarks: results.map((b) => b.asZBookmark()),
        nextCursor:
          resp.hits.length + (input.cursor?.offset || 0) >= resp.totalHits
            ? null
            : {
                ver: 1 as const,
                offset: resp.hits.length + (input.cursor?.offset || 0),
              },
      };
    }),
  checkUrl: bookmarksProcedure
    .input(
      z.object({
        url: z.string(),
      }),
    )
    .output(
      z.object({
        bookmarkId: z.string().nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      // Normalize and compare URLs (ignoring hash fragment and trailing slash)
      function normalizeUrl(url: string): string {
        const u = new URL(url);
        u.hash = "";
        let pathname = u.pathname;
        if (pathname.endsWith("/") && pathname !== "/") {
          pathname = pathname.slice(0, -1);
        }
        u.pathname = pathname;
        return u.toString();
      }

      // Strip hash before querying so the LIKE clause can match
      const normalizedInput = normalizeUrl(input.url);

      const results = await ctx.db
        .select({ id: bookmarkLinks.id, url: bookmarkLinks.url })
        .from(bookmarkLinks)
        .leftJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
        .where(
          and(
            eq(bookmarks.userId, ctx.user.id),
            like(bookmarkLinks.url, `${normalizedInput}%`),
          ),
        );

      if (results.length === 0) {
        return { bookmarkId: null };
      }

      const exactMatch = results.find(
        (r) => r.url && normalizeUrl(r.url) === normalizedInput,
      );

      return { bookmarkId: exactMatch?.id ?? null };
    }),
  getBookmarks: bookmarksProcedure
    .use(createBookmarksQueriedMiddleware())
    .input(zGetBookmarksRequestSchema)
    .output(zGetBookmarksResponseSchema)
    .query(async ({ input, ctx }) => {
      const res = await Bookmark.loadMulti(ctx, input);
      return {
        bookmarks: res.bookmarks.map((b) => b.asZBookmark()),
        nextCursor: res.nextCursor,
      };
    }),

  updateTags: bookmarksProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        attach: z.array(zManipulatedTagSchema),
        detach: z.array(zManipulatedTagSchema),
      }),
    )
    .output(
      z.object({
        attached: z.array(z.string()),
        detached: z.array(z.string()),
      }),
    )
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      // Helper function to fetch tag IDs and their names from a list of tag identifiers
      const fetchTagIdsWithNames = async (
        tagIdentifiers: { tagId?: string; tagName?: string }[],
      ): Promise<{ id: string; name: string }[]> => {
        const tagIds = tagIdentifiers.flatMap((t) =>
          t.tagId ? [t.tagId] : [],
        );
        const tagNames = tagIdentifiers.flatMap((t) =>
          t.tagName ? [t.tagName] : [],
        );

        // Fetch tag IDs in parallel
        const [byIds, byNames] = await Promise.all([
          tagIds.length > 0
            ? ctx.db
                .select({ id: bookmarkTags.id, name: bookmarkTags.name })
                .from(bookmarkTags)
                .where(
                  and(
                    eq(bookmarkTags.userId, ctx.user.id),
                    inArray(bookmarkTags.id, tagIds),
                  ),
                )
            : Promise.resolve([]),
          tagNames.length > 0
            ? ctx.db
                .select({ id: bookmarkTags.id, name: bookmarkTags.name })
                .from(bookmarkTags)
                .where(
                  and(
                    eq(bookmarkTags.userId, ctx.user.id),
                    inArray(bookmarkTags.name, tagNames),
                  ),
                )
            : Promise.resolve([]),
        ]);

        // Union results and deduplicate by tag ID
        const seen = new Set<string>();
        const results: { id: string; name: string }[] = [];

        for (const tag of [...byIds, ...byNames]) {
          if (!seen.has(tag.id)) {
            seen.add(tag.id);
            results.push({ id: tag.id, name: tag.name });
          }
        }

        return results;
      };

      // Normalize tag names and create new tags outside transaction to reduce transaction duration
      const normalizedAttachTags = input.attach.map((tag) => ({
        tagId: tag.tagId,
        tagName: tag.tagName ? normalizeTagName(tag.tagName) : undefined,
        attachedBy: tag.attachedBy,
      }));

      {
        // Create new tags
        const toAddTagNames = normalizedAttachTags
          .flatMap((i) => (i.tagName ? [i.tagName] : []))
          .filter((n) => n.length > 0); // drop empty results

        if (toAddTagNames.length > 0) {
          await ctx.db
            .insert(bookmarkTags)
            .values(
              toAddTagNames.map((name) => ({ name, userId: ctx.user.id })),
            )
            .onConflictDoNothing();
        }
      }

      // Fetch tag IDs for attachment/detachment now that we know that they all exist
      const [attachTagsWithNames, detachTagsWithNames] = await Promise.all([
        fetchTagIdsWithNames(normalizedAttachTags),
        fetchTagIdsWithNames(input.detach),
      ]);

      // Build the attachedBy map from the fetched results
      const tagIdToAttachedBy = new Map<string, "ai" | "human">();

      for (const fetchedTag of attachTagsWithNames) {
        // Find the corresponding input tag
        const inputTag = normalizedAttachTags.find(
          (t) =>
            (t.tagId && t.tagId === fetchedTag.id) ||
            (t.tagName && t.tagName === fetchedTag.name),
        );

        if (inputTag) {
          tagIdToAttachedBy.set(fetchedTag.id, inputTag.attachedBy);
        }
      }

      // Extract just the IDs for the transaction
      const allIdsToAttach = attachTagsWithNames.map((t) => t.id);
      const idsToRemove = detachTagsWithNames.map((t) => t.id);

      const res = await ctx.db.transaction(async (tx) => {
        let numChanges = 0;
        // Detaches
        if (idsToRemove.length > 0) {
          const res = await tx
            .delete(tagsOnBookmarks)
            .where(
              and(
                eq(tagsOnBookmarks.bookmarkId, input.bookmarkId),
                inArray(tagsOnBookmarks.tagId, idsToRemove),
              ),
            );
          numChanges += res.changes;
        }

        // Attach tags
        if (allIdsToAttach.length > 0) {
          const res = await tx
            .insert(tagsOnBookmarks)
            .values(
              allIdsToAttach.map((i) => ({
                tagId: i,
                bookmarkId: input.bookmarkId,
                attachedBy: tagIdToAttachedBy.get(i) ?? "human",
              })),
            )
            .onConflictDoNothing();
          numChanges += res.changes;
        }

        // Update bookmark modified timestamp
        if (numChanges > 0) {
          await tx
            .update(bookmarks)
            .set({ modifiedAt: new Date() })
            .where(
              and(
                eq(bookmarks.id, input.bookmarkId),
                eq(bookmarks.userId, ctx.user.id),
              ),
            );
        }

        return {
          bookmarkId: input.bookmarkId,
          attached: allIdsToAttach,
          detached: idsToRemove,
          numChanges,
        };
      });

      if (res.numChanges > 0) {
        await Promise.allSettled([
          RuleEngine.triggerOnEvent(
            ctx.bookmark.userId,
            input.bookmarkId,
            [
              ...res.detached.map((t) => ({
                type: "tagRemoved" as const,
                tagId: t,
              })),
              ...res.attached.map((t) => ({
                type: "tagAdded" as const,
                tagId: t,
              })),
            ],
            undefined,
            ctx.db,
          ),
          triggerSearchReindex(input.bookmarkId, {
            groupId: ctx.user.id,
          }),
          new WebhooksService(ctx.db).triggerWebhook(
            input.bookmarkId,
            "edited",
            ctx.bookmark.userId,
            {
              groupId: ctx.user.id,
            },
          ),
        ]);
      }
      return res;
    }),
  getBrokenLinks: bookmarksProcedure
    .output(
      z.object({
        bookmarks: z.array(
          z.object({
            id: z.string(),
            url: z.string(),
            statusCode: z.number().nullable(),
            isCrawlingFailure: z.boolean(),
            crawledAt: z.date().nullable(),
            createdAt: z.date().nullable(),
          }),
        ),
      }),
    )
    .query(async ({ ctx }) => {
      const brokenLinkBookmarks = await ctx.db
        .select({
          id: bookmarkLinks.id,
          url: bookmarkLinks.url,
          crawlStatusCode: bookmarkLinks.crawlStatusCode,
          crawlingStatus: bookmarkLinks.crawlStatus,
          crawledAt: bookmarkLinks.crawledAt,
          createdAt: bookmarks.createdAt,
        })
        .from(bookmarkLinks)
        .leftJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
        .where(
          and(
            eq(bookmarks.userId, ctx.user.id),
            or(
              eq(bookmarkLinks.crawlStatus, "failure"),
              lt(bookmarkLinks.crawlStatusCode, 200),
              gt(bookmarkLinks.crawlStatusCode, 299),
            ),
          ),
        );
      return {
        bookmarks: brokenLinkBookmarks.map((b) => ({
          id: b.id,
          url: b.url,
          statusCode: b.crawlStatusCode,
          isCrawlingFailure: b.crawlingStatus === "failure",
          crawledAt: b.crawledAt,
          createdAt: b.createdAt,
        })),
      };
    }),
  summarizeBookmark: bookmarksProcedure
    .use(
      createRateLimitMiddleware({
        name: "bookmarks.summarizeBookmark",
        windowMs: 30 * 60 * 1000,
        maxRequests: 100,
      }),
    )
    .input(
      z.object({
        bookmarkId: z.string(),
      }),
    )
    .output(
      z.object({
        summary: z.string(),
      }),
    )
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const inferenceClient = InferenceClientFactory.build();
      if (!inferenceClient) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No inference client configured",
        });
      }
      const bookmark = await ctx.db.query.bookmarkLinks.findFirst({
        where: eq(bookmarkLinks.id, input.bookmarkId),
      });

      if (!bookmark) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bookmark not found or not a link",
        });
      }

      const content = await Bookmark.getBookmarkPlainTextContent(
        bookmark,
        ctx.user.id,
      );

      const bookmarkDetails = `
Title: ${bookmark.title ?? ""}
Description: ${bookmark.description ?? ""}
Content: ${content}
Publisher: ${bookmark.publisher ?? ""}
Author: ${bookmark.author ?? ""}
`;

      const prompts = await ctx.db.query.customPrompts.findMany({
        where: and(
          eq(customPrompts.userId, ctx.user.id),
          eq(customPrompts.appliesTo, "summary"),
        ),
        columns: {
          text: true,
        },
      });

      const userSettings = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
        columns: {
          inferredTagLang: true,
        },
      });

      const summaryPrompt = await buildSummaryPrompt(
        userSettings?.inferredTagLang ?? serverConfig.inference.inferredTagLang,
        prompts.map((p) => p.text),
        bookmarkDetails,
        serverConfig.inference.contextLength,
      );

      const summary = await inferenceClient.inferFromText(summaryPrompt, {
        schema: null,
      });

      if (!summary.response) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to summarize bookmark",
        });
      }
      await ctx.db
        .update(bookmarks)
        .set({
          summary: summary.response,
        })
        .where(eq(bookmarks.id, input.bookmarkId));
      await Promise.all([
        triggerSearchReindex(input.bookmarkId, {
          groupId: ctx.user.id,
        }),
        new WebhooksService(ctx.db).triggerWebhook(
          input.bookmarkId,
          "edited",
          ctx.bookmark.userId,
          {
            groupId: ctx.user.id,
          },
        ),
      ]);

      return {
        bookmarkId: input.bookmarkId,
        summary: summary.response,
      };
    }),

  getSerendipity: bookmarksProcedure
    .input(
      z.object({
        count: z.number().int().min(1).max(10).default(3),
        windowDays: z.number().int().min(1).max(365).default(90),
      }),
    )
    .output(zGetBookmarksResponseSchema)
    .query(async ({ input, ctx }) => {
      const cutoff = new Date(
        Date.now() - input.windowDays * 24 * 60 * 60 * 1000,
      );
      const rows = await ctx.db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, ctx.user.id),
            eq(bookmarks.archived, false),
            gt(bookmarks.createdAt, cutoff),
          ),
        )
        .orderBy(
          sql`((julianday('now') - julianday(${bookmarks.createdAt})) * 0.5) * RANDOM()`,
        )
        .limit(input.count);
      if (rows.length === 0) {
        return { bookmarks: [], nextCursor: null };
      }
      const res = await Bookmark.loadMulti(ctx, {
        ids: rows.map((r) => r.id),
        sortOrder: "desc",
        includeContent: false,
        limit: input.count,
      });
      return {
        bookmarks: res.bookmarks.map((b) => b.asZBookmark()),
        nextCursor: null,
      };
    }),
});
