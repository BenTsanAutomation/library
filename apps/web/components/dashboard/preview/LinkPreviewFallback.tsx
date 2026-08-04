/**
 * LinkPreviewFallback — shown in the bookmark preview when Library's crawler
 * couldn't extract readable text for a LINK bookmark (X/Twitter, YouTube,
 * Instagram, and other JS-rendered pages routinely block server-side crawlers).
 *
 * Rendering strategy, in order:
 *   1. X/Twitter status → platform.twitter.com iframe
 *   2. YouTube watch / youtu.be / shorts → youtube.com/embed iframe
 *   3. Bluesky post → embed.bsky.app iframe
 *   4. Instagram p/reel → instagram.com/p/<id>/embed iframe
 *   5. Threads post → threads.net/@user/post/<id>/embed iframe
 *   6. Library-captured screenshotAssetId → show that
 *   7. Otherwise → quiet "preparing…" placeholder with a "View original" button
 *
 * The user's preferred path for X is the new "Save X tweet" right-click handler
 * in the extension, which populates real tweet content in the cached HTML —
 * this fallback only fires when that wasn't used.
 */

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExternalLink, Sparkles } from "lucide-react";

import type { ZBookmarkedLink } from "@library/shared/types/bookmarks";

function extractTwitterId(url: string): string | null {
  const m = url.match(
    /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/i,
  );
  return m?.[1] ?? null;
}

function extractYouTubeId(url: string): string | null {
  // youtu.be/<id>
  let m = url.match(/^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // youtube.com/watch?v=<id>
  m = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // youtube.com/shorts/<id>
  m = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return null;
}

function extractInstagramId(url: string): string | null {
  const m = url.match(
    /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/([^/?#]+)/i,
  );
  return m?.[1] ?? null;
}

function extractThreadsParts(url: string): { handle: string; id: string } | null {
  const m = url.match(
    /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@([^/]+)\/post\/([^/?#]+)/i,
  );
  return m ? { handle: m[1], id: m[2] } : null;
}

function extractBlueskyParts(
  url: string,
): { handle: string; rkey: string } | null {
  const m = url.match(
    /^https?:\/\/(?:www\.)?bsky\.app\/profile\/([^/]+)\/post\/([a-z0-9]+)/i,
  );
  return m ? { handle: m[1], rkey: m[2] } : null;
}

export default function LinkPreviewFallback({
  link,
}: {
  link: ZBookmarkedLink;
}) {
  const tweetId = extractTwitterId(link.url);
  if (tweetId) {
    return (
      <div className="flex h-full w-full items-start justify-center overflow-y-auto p-4">
        <iframe
          title="X tweet"
          src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=dark&dnt=true`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="h-[640px] w-full max-w-[550px] rounded-lg border-0"
        />
      </div>
    );
  }

  const ytId = extractYouTubeId(link.url);
  if (ytId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-4">
        <div className="aspect-video w-full max-w-4xl">
          <iframe
            title="YouTube video"
            src={`https://www.youtube.com/embed/${ytId}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full rounded-lg border-0"
          />
        </div>
      </div>
    );
  }

  const bsky = extractBlueskyParts(link.url);
  if (bsky) {
    return (
      <div className="flex h-full w-full items-start justify-center overflow-y-auto p-4">
        <iframe
          title="Bluesky post"
          src={`https://embed.bsky.app/static/embed.html?uri_url=${encodeURIComponent(link.url)}`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="h-[640px] w-full max-w-[550px] rounded-lg border-0"
        />
      </div>
    );
  }

  const igId = extractInstagramId(link.url);
  if (igId) {
    return (
      <div className="flex h-full w-full items-start justify-center overflow-y-auto p-4">
        <iframe
          title="Instagram post"
          src={`https://www.instagram.com/p/${igId}/embed`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="h-[720px] w-full max-w-[550px] rounded-lg border-0"
        />
      </div>
    );
  }

  const threads = extractThreadsParts(link.url);
  if (threads) {
    return (
      <div className="flex h-full w-full items-start justify-center overflow-y-auto p-4">
        <iframe
          title="Threads post"
          src={`https://www.threads.net/@${threads.handle}/post/${threads.id}/embed`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="h-[640px] w-full max-w-[550px] rounded-lg border-0"
        />
      </div>
    );
  }

  if (link.screenshotAssetId) {
    return (
      <div className="relative h-full w-full overflow-y-auto bg-[var(--bg-base)] p-4">
        <Image
          alt="page screenshot"
          src={`/api/assets/${link.screenshotAssetId}`}
          width={0}
          height={0}
          sizes="100vw"
          style={{ width: "100%", height: "auto" }}
          className="rounded-lg shadow-lg"
        />
      </div>
    );
  }

  if (link.imageAssetId) {
    return (
      <div className="relative h-full w-full overflow-y-auto bg-[var(--bg-base)] p-4">
        <Image
          alt={link.title ?? "page image"}
          src={`/api/assets/${link.imageAssetId}`}
          width={0}
          height={0}
          sizes="100vw"
          style={{ width: "100%", height: "auto" }}
          className="mx-auto max-w-3xl rounded-lg shadow-lg"
        />
      </div>
    );
  }

  // Final fallback — quiet, calm, not alarming
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <Sparkles className="h-8 w-8 text-[var(--fg-muted)] opacity-60" />
        </div>
        <div className="space-y-2">
          <p className="font-display text-[22px] italic text-[var(--fg-primary)]">
            preparing…
          </p>
          <p className="text-sm text-[var(--fg-muted)]">
            Couldn&apos;t pull readable text from this page yet — most likely the
            site blocks crawlers (X, Instagram, LinkedIn, etc.).
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={link.url} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            View original
          </Link>
        </Button>
      </div>
    </div>
  );
}
