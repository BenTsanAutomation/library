/**
 * X / Twitter tweet extractor — Library browser extension.
 *
 * Triggered when the user picks "Save X tweet" from the right-click
 * context menu on a URL matching `*://x.com/*​/status/*` or
 * `*://twitter.com/*​/status/*`.
 *
 * Fields extracted:
 *   - Tweet text (decoded from oEmbed HTML — entity-decoded, tags stripped)
 *   - Author display name + handle (parsed from oEmbed `author_url`)
 *   - Tweet URL (canonical, as supplied by the user)
 *
 * Method:
 *   Hits X's public oEmbed endpoint at
 *   `https://publish.twitter.com/oembed?url=<tweet-url>&omit_script=1`.
 *   No authentication required, works in Chrome MV3 service workers.
 *
 * Limitations (v1):
 *   - oEmbed returns ONLY the single tweet — no parent / no reply chain.
 *     If the user wants a thread, they should save individual tweet URLs.
 *   - Like / repost / view counts are NOT in oEmbed — omitted.
 *   - Posted-at timestamp is NOT in oEmbed — omitted.
 *   - Embedded images, polls, video are referenced inside the tweet text
 *     as t.co links but not downloaded.
 *   - We DO NOT scrape via authenticated cookies (fragile + ToS-risky).
 *   - oEmbed rate limits are not publicly documented; we surface non-2xx
 *     responses as failure toasts.
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

interface TwitterOEmbedResponse {
  url?: string;
  author_name?: string;
  author_url?: string;
  html?: string;
  provider_name?: string;
}

/**
 * Decode oEmbed `html` payload into plain text. The oEmbed shape is stable:
 *   <blockquote class="twitter-tweet"><p ...>tweet body</p>&mdash; Author Name (@handle) <a href="...">Date</a></blockquote>
 * Service-worker contexts have no DOMParser, so we rely on a small set of
 * tag/entity replacements. This is intentionally narrow — if the oEmbed
 * shape changes substantially we'll see junk and update the regex.
 */
function decodeOEmbedHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHandle(authorUrl: string | undefined): string {
  if (!authorUrl) return "";
  const m = authorUrl.match(/(?:twitter|x)\.com\/([^/?#]+)/i);
  return m ? m[1] : "";
}

export async function saveTweet(tweetUrl: string): Promise<void> {
  const auth: ExtensionAuth | null = await getAuth();
  if (!auth) {
    notifyError(
      "Save X tweet",
      new Error("Library extension is not configured. Open the popup and add an API key first."),
    );
    return;
  }

  try {
    const oembedUrl =
      "https://publish.twitter.com/oembed?omit_script=1&url=" +
      encodeURIComponent(tweetUrl);
    const res = await fetch(oembedUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`X oEmbed returned ${res.status}`);
    const data = (await res.json()) as TwitterOEmbedResponse;

    const author = data.author_name?.trim() || "Unknown author";
    const handle = extractHandle(data.author_url);

    const decoded = data.html ? decodeOEmbedHtml(data.html) : "";
    // The decoded text ends with "— Author (@handle) Date". Strip that
    // trailing attribution line to keep the tweet body clean.
    const tweetText = decoded
      .replace(/\n*—\s*[^\n]*\(@[^\n]*\)[^\n]*$/m, "")
      .trim();

    const summary = truncate(tweetText.replace(/\s+/g, " "), 80);
    const titleBase = handle ? `@${handle}` : author;
    const title = `${titleBase}: ${summary}`;

    const noteLines: string[] = [
      `**${author}**${handle ? ` (@${handle})` : ""}`,
      "",
      tweetText || "(empty tweet body)",
      "",
      "_v1 limitation: thread / reply context not extracted via oEmbed. To capture a thread, save each tweet URL separately._",
    ];

    const created = await postBookmark(auth, {
      type: "link",
      url: tweetUrl,
      title: truncate(title, 200),
      note: noteLines.join("\n"),
      source: "extension",
    });

    const tags = ["twitter"];
    if (handle) tags.push(`twitter:@${handle.toLowerCase()}`);
    await attachTags(auth, created.id, tags);

    notify("Saved X tweet", `${author}: ${summary}`);
  } catch (err) {
    notifyError("Save X tweet", err);
  }
}
