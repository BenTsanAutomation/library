/**
 * YouTube video extractor — Library browser extension.
 *
 * Triggered when the user picks "Save YouTube video" from the right-click
 * context menu on a URL matching `*://www.youtube.com/watch*` or
 * `*://youtu.be/*`.
 *
 * Fields extracted:
 *   - Title, channel name, channel URL, thumbnail URL (oEmbed JSON)
 *   - Description, duration, view count, posted-at (page meta scraped via
 *     chrome.scripting.executeScript when the user is on the YouTube tab)
 *   - Auto-generated transcript (timedtext XML, English first; falls back
 *     silently on 404 / 204 / empty response)
 *
 * Method:
 *   1. `https://www.youtube.com/oembed?url=<watch-url>&format=json` — public,
 *      no auth.
 *   2. `chrome.scripting.executeScript` against the active tab to read DOM
 *      meta tags. Skipped when no tabId is available (e.g. right-click on a
 *      link that points to a YouTube URL from a non-YouTube page).
 *   3. `https://www.youtube.com/api/timedtext?v=<id>&lang=en` — XML parsed
 *      via regex (no DOMParser in MV3 service workers).
 *
 * Limitations:
 *   - Transcripts only exist for videos with captions (auto-generated or
 *     manual). Music videos, live streams, and many shorts have none.
 *   - Page metadata extraction requires the user to be on the YouTube tab.
 *     Saving a YouTube link from another page falls back to oEmbed-only
 *     basics (no description, view count, duration, posted-at).
 *   - Description is truncated to 1000 characters per spec.
 *   - timedtext is an undocumented best-effort endpoint. YouTube can and
 *     occasionally does change the URL scheme; if that happens, transcripts
 *     will silently disappear and we'll need to update the URL here.
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

interface YouTubeOEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

interface YouTubePageMeta {
  description?: string;
  viewCount?: string;
  publishedAt?: string;
  duration?: string;
}

function parseVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return u.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (u.hostname.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
      if (m) return m[1];
    }
  } catch {
    /* malformed URL */
  }
  return null;
}

async function fetchOEmbed(url: string): Promise<YouTubeOEmbedResponse | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as YouTubeOEmbedResponse;
  } catch {
    return null;
  }
}

async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?lang=en&v=${encodeURIComponent(videoId)}`,
    );
    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml || xml.trim().length === 0) return null;
    const matches = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g));
    if (matches.length === 0) return null;
    const decoded = matches
      .map((m) =>
        m[1]
          .replace(/&amp;/g, "&")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\n+/g, " "),
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return decoded || null;
  } catch {
    return null;
  }
}

async function extractPageMeta(tabId?: number): Promise<YouTubePageMeta> {
  if (typeof tabId !== "number") return {};
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const attr = (sel: string, name = "content"): string | undefined =>
          document.querySelector(sel)?.getAttribute(name) ?? undefined;
        return {
          description: attr('meta[name="description"]'),
          viewCount: attr('meta[itemprop="interactionCount"]'),
          publishedAt:
            attr('meta[itemprop="datePublished"]') ??
            attr('meta[itemprop="uploadDate"]'),
          duration: attr('meta[itemprop="duration"]'),
        };
      },
    });
    const result = results[0]?.result as YouTubePageMeta | undefined;
    return result ?? {};
  } catch {
    // Common when right-click happened on a link from a non-YouTube origin.
    return {};
  }
}

export async function saveYouTubeVideo(
  videoUrl: string,
  tabId?: number,
): Promise<void> {
  const auth: ExtensionAuth | null = await getAuth();
  if (!auth) {
    notifyError(
      "Save YouTube video",
      new Error("Library extension is not configured. Open the popup and add an API key first."),
    );
    return;
  }

  try {
    const videoId = parseVideoId(videoUrl);
    if (!videoId) throw new Error("Could not parse YouTube video ID from URL");

    const [oembed, pageMeta, transcript] = await Promise.all([
      fetchOEmbed(videoUrl),
      extractPageMeta(tabId),
      fetchTranscript(videoId),
    ]);

    const title = oembed?.title?.trim() || "YouTube video";
    const channel = oembed?.author_name?.trim() ?? "";
    const description = pageMeta.description
      ? truncate(pageMeta.description, 1000)
      : "";

    const noteParts: string[] = [];
    if (channel) noteParts.push(`**Channel:** ${channel}`);
    if (oembed?.author_url) noteParts.push(`Channel URL: ${oembed.author_url}`);
    if (pageMeta.duration) noteParts.push(`**Duration:** ${pageMeta.duration}`);
    if (pageMeta.viewCount) noteParts.push(`**Views:** ${pageMeta.viewCount}`);
    if (pageMeta.publishedAt)
      noteParts.push(`**Published:** ${pageMeta.publishedAt}`);
    if (oembed?.thumbnail_url)
      noteParts.push(`Thumbnail: ${oembed.thumbnail_url}`);
    if (description) noteParts.push("", description);
    if (transcript) {
      noteParts.push("", "**Transcript (auto):**", truncate(transcript, 6000));
    }

    const created = await postBookmark(auth, {
      type: "link",
      url: videoUrl,
      title: truncate(title, 200),
      note: noteParts.join("\n"),
      source: "extension",
    });

    const tags = ["youtube"];
    if (channel) {
      const slug = channel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (slug) tags.push(`youtube:${slug}`);
    }
    if (transcript) tags.push("has-transcript");
    await attachTags(auth, created.id, tags);

    notify("Saved YouTube video", channel ? `${channel} — ${title}` : title);
  } catch (err) {
    notifyError("Save YouTube video", err);
  }
}
