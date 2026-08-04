/**
 * Reddit post extractor — Library browser extension.
 *
 * Triggered when the user picks "Save Reddit post" from the right-click
 * context menu on a URL matching `*://*.reddit.com/r/*​/comments/*`.
 *
 * Fields extracted:
 *   - Post title
 *   - Post body (selftext for self-posts; outbound link for link-posts)
 *   - Author
 *   - Subreddit
 *   - Score (upvotes - downvotes at fetch time)
 *   - Top 5 comments (author, score, body)
 *
 * Method:
 *   Reddit exposes every post as JSON at `<post-url>.json` for anonymous
 *   readers — no API key, no OAuth. We hit that endpoint and parse the
 *   two-element array it returns: [postListing, commentListing].
 *
 * Limitations / gotchas:
 *   - Anonymous reads are rate-limited (~60 req / 10 min by IP). Bursty users
 *     will see 429s; we surface those as failure toasts.
 *   - Quarantined / private subreddits 403 — we can't bypass that.
 *   - `score` is a snapshot. It will drift as voting continues.
 *   - We DO NOT scrape via authenticated cookies (fragile + ToS-risky).
 */

import {
  attachTags,
  ExtensionAuth,
  getAuth,
  notify,
  notifyError,
  postBookmark,
  truncate,
} from "./_shared";

interface RedditPostData {
  title?: string;
  author?: string;
  subreddit?: string;
  score?: number;
  selftext?: string;
  is_self?: boolean;
  url_overridden_by_dest?: string;
  url?: string;
  permalink?: string;
  num_comments?: number;
}

interface RedditCommentData {
  author?: string;
  score?: number;
  body?: string;
}

interface RedditListingChild<T> {
  kind: string;
  data: T;
}

interface RedditListing<T> {
  data?: { children?: RedditListingChild<T>[] };
}

function normalizeUrl(url: string): string {
  return url.split("?")[0].split("#")[0].replace(/\/$/, "");
}

export async function saveRedditPost(url: string): Promise<void> {
  const auth: ExtensionAuth | null = await getAuth();
  if (!auth) {
    notifyError(
      "Save Reddit post",
      new Error("Library extension is not configured. Open the popup and add an API key first."),
    );
    return;
  }

  try {
    const cleanUrl = normalizeUrl(url);
    const jsonUrl = `${cleanUrl}.json?raw_json=1&limit=5`;
    const res = await fetch(jsonUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Reddit returned ${res.status}`);
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body) || body.length < 1) {
      throw new Error("Unexpected Reddit response shape");
    }

    const postListing = body[0] as RedditListing<RedditPostData>;
    const commentListing = body[1] as RedditListing<RedditCommentData> | undefined;
    const post = postListing?.data?.children?.[0]?.data;
    if (!post) throw new Error("Could not locate post data");

    const title = post.title ?? "Reddit post";
    const author = post.author ?? "[deleted]";
    const subreddit = post.subreddit ?? "";
    const score = post.score ?? 0;
    const numComments = post.num_comments ?? 0;
    const externalUrl = post.url_overridden_by_dest ?? post.url ?? cleanUrl;
    const isSelf = !!post.is_self;

    const topComments = (commentListing?.data?.children ?? [])
      .filter((c) => c.kind === "t1")
      .slice(0, 5)
      .map((c) => ({
        author: c.data.author ?? "[deleted]",
        score: c.data.score ?? 0,
        body: (c.data.body ?? "").trim(),
      }))
      .filter((c) => c.body.length > 0);

    const noteParts: string[] = [];
    noteParts.push(`**r/${subreddit}** · u/${author} · ↑${score} · 💬 ${numComments}`);
    if (!isSelf && externalUrl && normalizeUrl(externalUrl) !== cleanUrl) {
      noteParts.push(`Linked: ${externalUrl}`);
    }
    if (post.selftext && post.selftext.trim()) {
      noteParts.push("", truncate(post.selftext.trim(), 1500));
    }
    if (topComments.length > 0) {
      noteParts.push("", "**Top comments:**");
      topComments.forEach((c, idx) => {
        const oneLineBody = c.body.replace(/\s+/g, " ");
        noteParts.push(
          `${idx + 1}. u/${c.author} (↑${c.score}) — ${truncate(oneLineBody, 400)}`,
        );
      });
    }

    const created = await postBookmark(auth, {
      type: "link",
      url: cleanUrl,
      title: truncate(title, 200),
      note: noteParts.join("\n"),
      source: "extension",
    });

    await attachTags(auth, created.id, [
      "reddit",
      subreddit ? `reddit:${subreddit.toLowerCase()}` : "",
    ]);

    notify("Saved Reddit post", title);
  } catch (err) {
    notifyError("Save Reddit post", err);
  }
}
