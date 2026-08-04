/**
 * Screenshot snip extractor — Library browser extension.
 *
 * Triggered when the user picks "Snip & save screenshot" from the right-click
 * context menu. Mimics the Windows Snipping Tool flow:
 *   1. Capture the visible tab area as a PNG dataURL
 *   2. Inject a content script overlay that lets the user drag-select a region
 *   3. Crop the captured PNG to that region (OffscreenCanvas in service worker)
 *   4. Upload the cropped PNG as an asset to Library
 *   5. Create an asset-type bookmark referencing the asset, sourceUrl = page URL
 *   6. Toast success / failure
 *
 * Notes:
 *   - We capture FIRST, then overlay — that way the overlay itself isn't in the
 *     screenshot. (Capture-then-mask is the same trick Windows Snip uses.)
 *   - Overlay is injected via chrome.scripting.executeScript with `func:` so we
 *     don't need a separate content-script file. The overlay communicates back
 *     via `window.postMessage` → wrapper function awaits via Promise.
 *   - Service workers can't use `document` / `Image`, so cropping uses
 *     `createImageBitmap` + `OffscreenCanvas` (both supported in MV3 service
 *     workers as of Chrome 109+).
 */

import {
  ExtensionAuth,
  getAuth,
  notify,
  notifyError,
} from "./_shared";

interface SnipRect {
  /** CSS pixels in the viewport — top-left of the selection. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** devicePixelRatio at capture time — captured PNG is at this scale. */
  devicePixelRatio: number;
}

/** Public entry point — wired from background.ts on context-menu click. */
export async function snipAndSaveScreenshot(
  tab: chrome.tabs.Tab,
): Promise<void> {
  if (!tab.id || !tab.windowId) {
    notify("Library", "Cannot capture: no active tab");
    return;
  }

  let auth: ExtensionAuth | null = null;
  try {
    auth = await getAuth();
  } catch (err) {
    notifyError("auth", err);
    return;
  }
  if (!auth) {
    notify(
      "Library not configured",
      "Set the server URL + API key in the extension settings first.",
    );
    return;
  }

  let captureDataUrl: string;
  try {
    captureDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
  } catch (err) {
    notifyError("capture visible tab", err);
    return;
  }

  let rect: SnipRect | null;
  try {
    rect = await runSnipOverlay(tab.id);
  } catch (err) {
    notifyError("snip overlay", err);
    return;
  }
  if (!rect) {
    // User cancelled (Esc or tiny selection). Silent — no toast.
    return;
  }

  let croppedBlob: Blob;
  try {
    croppedBlob = await cropDataUrl(captureDataUrl, rect);
  } catch (err) {
    notifyError("crop", err);
    return;
  }

  try {
    const assetId = await uploadAsset(auth, croppedBlob);
    await createAssetBookmark(auth, assetId, tab.url, tab.title);
    notify("Library", `Screenshot saved (${formatBytes(croppedBlob.size)})`);
  } catch (err) {
    notifyError("upload", err);
  }
}

/**
 * Inject the snip overlay into the active tab and await the user's selection.
 * Resolves with the rect in viewport CSS pixels, or null if cancelled.
 */
async function runSnipOverlay(tabId: number): Promise<SnipRect | null> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    // The function below runs in the page's isolated world. It must be
    // self-contained (no closures over background-script state).
    func: () => {
      return new Promise<SnipRect | null>((resolve) => {
        // Bail early if a previous overlay is still mounted (shouldn't happen
        // but defensive).
        if (document.getElementById("__library_snip_overlay__")) {
          resolve(null);
          return;
        }

        const overlay = document.createElement("div");
        overlay.id = "__library_snip_overlay__";
        overlay.setAttribute(
          "style",
          [
            "position:fixed",
            "inset:0",
            "z-index:2147483647",
            "cursor:crosshair",
            "background:rgba(20,18,16,0.35)",
            "user-select:none",
            "-webkit-user-select:none",
          ].join(";"),
        );

        const selection = document.createElement("div");
        selection.setAttribute(
          "style",
          [
            "position:absolute",
            "border:1.5px dashed rgba(244,239,232,0.95)",
            "background:rgba(200,105,58,0.12)",
            "box-shadow:0 0 0 1px rgba(0,0,0,0.4)",
            "pointer-events:none",
            "display:none",
          ].join(";"),
        );
        overlay.appendChild(selection);

        const hint = document.createElement("div");
        hint.textContent = "drag to snip · esc to cancel";
        hint.setAttribute(
          "style",
          [
            "position:fixed",
            "top:24px",
            "left:50%",
            "transform:translateX(-50%)",
            "padding:8px 14px",
            "background:rgba(14,13,12,0.85)",
            "color:#F4EFE8",
            "font:italic 14px/1.2 'Iowan Old Style','Palatino Linotype',Georgia,serif",
            "border-radius:999px",
            "letter-spacing:0.2px",
            "pointer-events:none",
          ].join(";"),
        );
        overlay.appendChild(hint);

        document.documentElement.appendChild(overlay);

        let startX = 0;
        let startY = 0;
        let dragging = false;
        let curRect: SnipRect | null = null;

        const cleanup = () => {
          window.removeEventListener("keydown", onKey, true);
          overlay.removeEventListener("mousedown", onDown);
          overlay.removeEventListener("mousemove", onMove);
          overlay.removeEventListener("mouseup", onUp);
          overlay.remove();
        };

        const onDown = (e: MouseEvent) => {
          dragging = true;
          startX = e.clientX;
          startY = e.clientY;
          selection.style.left = `${startX}px`;
          selection.style.top = `${startY}px`;
          selection.style.width = "0";
          selection.style.height = "0";
          selection.style.display = "block";
        };

        const onMove = (e: MouseEvent) => {
          if (!dragging) return;
          const x = Math.min(startX, e.clientX);
          const y = Math.min(startY, e.clientY);
          const w = Math.abs(e.clientX - startX);
          const h = Math.abs(e.clientY - startY);
          selection.style.left = `${x}px`;
          selection.style.top = `${y}px`;
          selection.style.width = `${w}px`;
          selection.style.height = `${h}px`;
        };

        const onUp = (e: MouseEvent) => {
          if (!dragging) return;
          dragging = false;
          const x = Math.min(startX, e.clientX);
          const y = Math.min(startY, e.clientY);
          const w = Math.abs(e.clientX - startX);
          const h = Math.abs(e.clientY - startY);
          if (w < 8 || h < 8) {
            // Treat as a click → cancel
            cleanup();
            resolve(null);
            return;
          }
          curRect = {
            x,
            y,
            width: w,
            height: h,
            devicePixelRatio: window.devicePixelRatio || 1,
          };
          cleanup();
          resolve(curRect);
        };

        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            cleanup();
            resolve(null);
          }
        };

        window.addEventListener("keydown", onKey, true);
        overlay.addEventListener("mousedown", onDown);
        overlay.addEventListener("mousemove", onMove);
        overlay.addEventListener("mouseup", onUp);
      });
    },
  });
  return (result?.result as SnipRect | null) ?? null;
}

/**
 * Crop the captured PNG dataURL to `rect` in service-worker context.
 * Uses OffscreenCanvas — works in MV3 service workers.
 */
async function cropDataUrl(
  dataUrl: string,
  rect: SnipRect,
): Promise<Blob> {
  const res = await fetch(dataUrl);
  const fullBlob = await res.blob();
  const bitmap = await createImageBitmap(fullBlob);

  // captureVisibleTab returns a PNG at devicePixelRatio scale relative to
  // CSS pixels — so multiply CSS rect by dpr to land on the right pixels.
  const dpr = rect.devicePixelRatio || 1;
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.round(rect.width * dpr);
  const sh = Math.round(rect.height * dpr);

  // Defensive clamp in case the rect overshoots the captured bitmap.
  const cw = Math.min(sw, bitmap.width - sx);
  const ch = Math.min(sh, bitmap.height - sy);
  if (cw <= 0 || ch <= 0) {
    throw new Error("Snip rectangle was outside captured area");
  }

  const canvas = new OffscreenCanvas(cw, ch);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx.drawImage(bitmap, sx, sy, cw, ch, 0, 0, cw, ch);
  const out = await canvas.convertToBlob({ type: "image/png" });
  bitmap.close?.();
  return out;
}

async function uploadAsset(
  auth: ExtensionAuth,
  blob: Blob,
): Promise<string> {
  const filename = `library-snip-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19)}.png`;
  const form = new FormData();
  form.append("file", new File([blob], filename, { type: "image/png" }));

  const res = await fetch(`${auth.apiBase}/api/v1/assets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.apiKey}`,
      ...auth.customHeaders,
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`assets ${res.status}: ${text || res.statusText}`);
  }
  const { assetId } = (await res.json()) as { assetId: string };
  if (!assetId) throw new Error("assets response missing assetId");
  return assetId;
}

async function createAssetBookmark(
  auth: ExtensionAuth,
  assetId: string,
  sourceUrl: string | undefined,
  pageTitle: string | undefined,
): Promise<void> {
  const payload = {
    type: "asset" as const,
    assetType: "image" as const,
    assetId,
    sourceUrl,
    title: pageTitle ? `Snip — ${pageTitle}` : "Snip",
    source: "extension",
  };

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
    throw new Error(`bookmarks ${res.status}: ${text || res.statusText}`);
  }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
