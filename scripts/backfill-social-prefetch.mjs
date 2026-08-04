#!/usr/bin/env node
/**
 * One-shot backfill: re-runs the per-platform prefetch on existing social
 * bookmarks whose htmlContent was clobbered by the headless-Chromium crawler
 * (X "ScriptLoadFailure", IG/Threads/LinkedIn placeholder pages, etc.).
 *
 * Mirrors the dispatch logic in packages/trpc/routers/bookmarks.ts so it can
 * run standalone (no tRPC context). Re-enqueues an AI tag job through the
 * SQLite-backed BullMQ queue for any bookmark whose content was rewritten.
 */
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../data/db.db");
const QUEUE_DB_PATH = path.resolve(__dirname, "../data/queue.db");

console.log(`[backfill] DB_PATH=${DB_PATH}`);
const db = new Database(DB_PATH);
// DBs are already in WAL mode (set on first dashboard boot). Re-issuing
// `journal_mode = WAL` against another writer's open connection has been
// observed to silently roll back this connection's writes. Don't touch it.
const queueDb = new Database(QUEUE_DB_PATH);

const SOCIAL_LIKE = [
  "%twitter.com/%/status/%",
  "%x.com/%/status/%",
  "%bsky.app/profile/%/post/%",
  "%reddit.com/r/%/comments/%",
  "%youtube.com/shorts/%",
  "%youtube.com/watch?v=%",
  "%youtu.be/%",
];

const rows = db
  .prepare(
    `SELECT bl.id, bl.url, b.userId
     FROM bookmarkLinks bl
     JOIN bookmarks b ON b.id = bl.id
     WHERE b.archived = 0
       AND (${SOCIAL_LIKE.map(() => "bl.url LIKE ?").join(" OR ")})`,
  )
  .all(...SOCIAL_LIKE);

console.log(`[backfill] candidates: ${rows.length}`);

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const updateLink = db.prepare(
  `UPDATE bookmarkLinks SET htmlContent = ?, description = ?, imageUrl = ?, crawledAt = ?, crawlStatus = 'success' WHERE id = ?`,
);
const updateBookmarkTitle = db.prepare(
  `UPDATE bookmarks SET title = ? WHERE id = ?`,
);

async function prefetchTwitter(id, url) {
  const m = url.match(/\/status\/(\d+)/);
  if (!m) return false;
  const tweetId = m[1];
  let html = null;
  let description = "";
  let authorTitle = null;
  let imageUrl = null;
  try {
    const synRes = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${tweetId.slice(-6)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (synRes.ok) {
      const j = await synRes.json();
      const text = j.text ?? "";
      const author = j.user?.screen_name ?? j.user?.name ?? "unknown";
      description = text.slice(0, 500);
      authorTitle = `@${author} on X`;
      const photo = j.photos?.[0]?.url ?? null;
      const mediaThumb = j.mediaDetails?.[0]?.media_url_https ?? null;
      const avatar =
        j.user?.profile_image_url_https?.replace("_normal", "_400x400") ??
        null;
      imageUrl = photo ?? mediaThumb ?? avatar;
      html = `<blockquote class="library-x-post"><p>${escapeHtml(text)}</p><footer>— ${escapeHtml(j.user?.name ?? author)} (@${escapeHtml(author)}) on X</footer></blockquote>`;
    }
  } catch (e) {
    console.warn(`  syndication failed: ${e?.message ?? e}`);
  }
  if (!html) {
    const res = await fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true&hide_thread=false`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LibraryBot/1.0)" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.html) return false;
    html = data.html;
    description = stripHtml(data.html).slice(0, 500);
    if (data.author_name) authorTitle = `@${data.author_name} on X`;
  }
  console.log(`  [twitter] html-len=${html?.length ?? 0} imageUrl=${imageUrl} title=${authorTitle}`);
  updateLink.run(html, description, imageUrl, Math.floor(Date.now() / 1000), id);
  if (authorTitle) updateBookmarkTitle.run(authorTitle, id);
  return true;
}

async function prefetchBluesky(id, url) {
  const m = url.match(/bsky\.app\/profile\/([^/]+)\/post\/([a-z0-9]+)/i);
  if (!m) return false;
  const [, handle, rkey] = m;
  const didRes = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!didRes.ok) return false;
  const { did } = await didRes.json();
  if (!did) return false;
  const atUri = `at://${did}/app.bsky.feed.post/${rkey}`;
  const postRes = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(atUri)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!postRes.ok) return false;
  const data = await postRes.json();
  const post = data.posts?.[0];
  if (!post?.record?.text) return false;
  const text = post.record.text;
  const author = post.author?.displayName || post.author?.handle || "unknown";
  const firstImg = post.embed?.images?.[0]?.fullsize ?? null;
  const html = `<blockquote class="library-bsky-post"><p>${escapeHtml(text)}</p><footer>— @${escapeHtml(author)} on Bluesky</footer></blockquote>`;
  updateLink.run(html, text.slice(0, 500), firstImg, Math.floor(Date.now() / 1000), id);
  updateBookmarkTitle.run(`@${author} on Bluesky`, id);
  return true;
}

async function prefetchYouTube(id, url) {
  const shorts = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i);
  const watch = url.match(/youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i);
  const shortLink = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i);
  const videoId = shorts?.[1] ?? watch?.[1] ?? shortLink?.[1] ?? null;
  if (!videoId) return false;
  const oembedRes = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; LibraryBot/1.0)" }, signal: AbortSignal.timeout(8000) },
  );
  let title = `YouTube video · ${videoId}`;
  let author = null;
  let authorUrl = null;
  let oembedThumb = null;
  if (oembedRes.ok) {
    const j = await oembedRes.json();
    if (j.title) title = j.title;
    author = j.author_name ?? null;
    authorUrl = j.author_url ?? null;
    oembedThumb = j.thumbnail_url ?? null;
  }
  const imageUrl = oembedThumb ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const isShort = !!shorts;
  const html = `<article class="library-youtube-post"><header><p class="yt-meta">YouTube${isShort ? " Short" : ""}${author ? ` · ${escapeHtml(author)}` : ""}</p><h1>${escapeHtml(title)}</h1></header><p class="yt-watch">→ <a href="https://www.youtube.com/watch?v=${escapeHtml(videoId)}" target="_blank" rel="noreferrer">Watch on YouTube</a></p>${authorUrl ? `<p class="yt-channel"><a href="${escapeHtml(authorUrl)}" target="_blank" rel="noreferrer">${escapeHtml(author ?? authorUrl)}'s channel</a></p>` : ""}</article>`;
  updateLink.run(html, `${title}${author ? ` — ${author}` : ""}`.slice(0, 500), imageUrl, Math.floor(Date.now() / 1000), id);
  updateBookmarkTitle.run(title, id);
  return true;
}

function pickRedditImage(p) {
  const previewImg = p?.preview?.images?.[0]?.source?.url ?? null;
  const directMedia =
    p?.url_overridden_by_dest && /\.(jpe?g|png|gif|webp)$/i.test(p.url_overridden_by_dest)
      ? p.url_overridden_by_dest
      : null;
  const thumb = p?.thumbnail && /^https?:\/\//.test(p.thumbnail) ? p.thumbnail : null;
  return previewImg ?? directMedia ?? thumb ?? null;
}

function selftextToHtml(text) {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join("");
}

async function prefetchReddit(id, url) {
  const m = url.match(/reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)/i);
  if (!m) return false;
  const cleanUrl = url.split("?")[0].split("#")[0].replace(/\/?$/, "/");
  const jsonUrl =
    cleanUrl.replace(/^https?:\/\/[^/]+/, "https://www.reddit.com") +
    ".json?raw_json=1";
  const res = await fetch(jsonUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LibraryBot/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return false;
  const data = await res.json();
  const post = data?.[0]?.data?.children?.[0]?.data;
  if (!post?.title) return false;
  const parent = post.crosspost_parent_list?.[0];
  const contentSource = parent ?? post;
  const selftext = (contentSource.selftext ?? "").trim();
  const externalLink =
    contentSource.url_overridden_by_dest &&
    !/reddit\.com|redd\.it/i.test(contentSource.url_overridden_by_dest)
      ? contentSource.url_overridden_by_dest
      : null;
  const imageUrl = pickRedditImage(contentSource) ?? pickRedditImage(post);
  const comments =
    data?.[1]?.data?.children
      ?.map((c) => c.data)
      ?.filter((c) => c?.body && c.author && c.author !== "AutoModerator")
      ?.slice(0, 3) ?? [];

  const subPrefixed = post.subreddit_name_prefixed ?? `r/${m[1]}`;
  const author = post.author ?? "unknown";
  let bodyHtml = "";
  if (selftext) bodyHtml += selftextToHtml(selftext);
  if (externalLink) {
    bodyHtml += `<p class="reddit-external">→ <a href="${escapeHtml(externalLink)}" target="_blank" rel="noreferrer">${escapeHtml(externalLink)}</a></p>`;
  }
  if (parent && (parent.subreddit_name_prefixed || parent.permalink)) {
    bodyHtml += `<p class="reddit-crosspost">Crossposted from <a href="https://www.reddit.com${escapeHtml(parent.permalink ?? "")}" target="_blank" rel="noreferrer">${escapeHtml(parent.subreddit_name_prefixed ?? "the original post")}</a></p>`;
  }
  if (!selftext && !externalLink && comments.length > 0) {
    bodyHtml += `<section class="reddit-comments"><h2>Top comments</h2>` +
      comments.map((c) => `<blockquote><footer>u/${escapeHtml(c.author)}${typeof c.score === "number" ? ` · ${c.score}↑` : ""}</footer>${selftextToHtml(c.body)}</blockquote>`).join("") +
      `</section>`;
  }
  if (!bodyHtml) {
    bodyHtml = `<p class="reddit-external">→ <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">View on Reddit</a></p>`;
  }
  const html = `<article class="library-reddit-post"><header><p class="reddit-meta">${escapeHtml(subPrefixed)} · u/${escapeHtml(author)}${typeof post.score === "number" ? ` · ${post.score}↑` : ""}${typeof post.num_comments === "number" ? ` · ${post.num_comments} comments` : ""}</p><h1>${escapeHtml(post.title)}</h1></header>${bodyHtml}</article>`;
  const description =
    selftext ||
    (externalLink ? `Linked: ${externalLink}` : "") ||
    comments[0]?.body ||
    post.title;
  updateLink.run(html, description.slice(0, 500), imageUrl, Math.floor(Date.now() / 1000), id);
  updateBookmarkTitle.run(`${post.title} — ${subPrefixed}`, id);
  return true;
}

async function dispatch(id, url) {
  if (/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^/]+\/status\/\d+/i.test(url)) return prefetchTwitter(id, url);
  if (/^https?:\/\/(?:[^/]+\.)?bsky\.app\/profile\/[^/]+\/post\/[a-z0-9]+/i.test(url)) return prefetchBluesky(id, url);
  if (/^https?:\/\/(?:www\.|old\.|new\.|np\.)?reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+/i.test(url)) return prefetchReddit(id, url);
  if (/^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts\/|watch\?v=)[A-Za-z0-9_-]{11}/i.test(url) || /^https?:\/\/youtu\.be\/[A-Za-z0-9_-]{11}/i.test(url)) return prefetchYouTube(id, url);
  return false;
}

// `liteque` writes to a `tasks` table — schema captured from
// node_modules/liteque/dist/index.js. Insert pending AI-tag jobs that the
// running worker will dequeue on its next poll. Numeric ts columns use
// `timestamp` (sec) for createdAt and `timestamp_ms` for availableAt.
const insertTask = queueDb.prepare(
  `INSERT INTO tasks (queue, payload, createdAt, availableAt, status, allocationId, numRunsLeft, maxNumRuns, priority)
   VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
);
function genAllocId() {
  return Math.random().toString(36).substring(2, 15);
}

let updated = 0;
for (const r of rows) {
  console.log(`[backfill] ${r.url}`);
  try {
    const ok = await dispatch(r.id, r.url);
    if (ok) {
      updated++;
      const nowSec = Math.floor(Date.now() / 1000);
      const nowMs = Date.now();
      insertTask.run(
        "openai_queue",
        JSON.stringify({ bookmarkId: r.id, type: "tag" }),
        nowSec,
        nowMs,
        genAllocId(),
        4, // numRunsLeft = retries(3) + 1
        4, // maxNumRuns
        0, // priority (Default)
      );
    }
  } catch (e) {
    console.warn(`  failed: ${e?.message ?? e}`);
  }
}

console.log(`[backfill] done — updated: ${updated}/${rows.length}`);
// Explicit COMMIT — verify-in-script showed correct rows, but a fresh
// reader after exit saw old data, suggesting a hidden implicit transaction
// (or autocommit not firing for ESM). Force commit + checkpoint.
try { db.exec("COMMIT"); } catch { /* ignore — already committed */ }
const verify = db
  .prepare(`SELECT description, length(htmlContent) AS hlen, imageUrl FROM bookmarkLinks WHERE id = ?`)
  .get(rows[0].id);
console.log(`[backfill] verify in-script:`, verify);
db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
queueDb.close();
