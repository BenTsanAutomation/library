#!/usr/bin/env node
const TelegramBot = require("node-telegram-bot-api");

const {
  TELEGRAM_BOT_TOKEN,
  LIBRARY_API_KEY,
  LIBRARY_BASE_URL = "https://library.example.com",
  ALLOWED_USER_IDS = "",
} = process.env;

if (!TELEGRAM_BOT_TOKEN || !LIBRARY_API_KEY) {
  console.error("Missing TELEGRAM_BOT_TOKEN or LIBRARY_API_KEY");
  process.exit(1);
}

const allowed = new Set(
  ALLOWED_USER_IDS.split(",").map((s) => s.trim()).filter(Boolean),
);
if (allowed.size === 0) {
  console.error("ALLOWED_USER_IDS is empty — refusing to start (would accept all users)");
  process.exit(1);
}

const FETCH_TIMEOUT_MS = 10_000;
const URL_RE = /https?:\/\/[^\s<>"]+/gi;

function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

function extractUrls(msg) {
  const urls = new Set();
  const text = (msg.text || msg.caption || "").trim();
  const entities = msg.entities || msg.caption_entities || [];

  for (const e of entities) {
    if (e.type === "url" && text) {
      urls.add(text.substr(e.offset, e.length));
    } else if (e.type === "text_link" && e.url) {
      urls.add(e.url);
    }
  }
  if (text) {
    const m = text.match(URL_RE);
    if (m) for (const u of m) urls.add(u);
  }
  return [...urls];
}

function apiHeaders() {
  return {
    Authorization: `Bearer ${LIBRARY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function saveBookmark(url) {
  const res = await fetchWithTimeout(`${LIBRARY_BASE_URL}/api/v1/bookmarks`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ type: "link", url }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

async function getLists() {
  const res = await fetchWithTimeout(`${LIBRARY_BASE_URL}/api/v1/lists`, {
    headers: apiHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.lists || [];
}

async function addToList(listId, bookmarkId) {
  const res = await fetchWithTimeout(
    `${LIBRARY_BASE_URL}/api/v1/lists/${listId}/bookmarks`,
    {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ bookmarkId }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on("polling_error", (e) => console.error("[poll-error]", e.code, e.message));

// /start, /help
bot.onText(/^\/(start|help)$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!allowed.has(String(msg.from?.id ?? ""))) return;
  await bot.sendMessage(
    chatId,
    "Send me any link and I'll save it to your Library library.\n" +
      "After saving you can add it to a list.\n\n" +
      "/lists — show all your lists",
  );
});

// /lists
bot.onText(/^\/lists$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!allowed.has(String(msg.from?.id ?? ""))) return;
  try {
    const lists = await getLists();
    if (lists.length === 0) {
      await bot.sendMessage(chatId, "No lists found. Create one in the Library.");
      return;
    }
    const text = lists.map((l) => `${l.icon || "📁"} ${l.name} (${l.id})`).join("\n");
    await bot.sendMessage(chatId, `Your lists:\n\n${text}`);
  } catch (e) {
    await bot.sendMessage(chatId, `Failed to fetch lists: ${e.message}`);
  }
});

// Incoming messages with URLs
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from?.id ?? "");

  if (!allowed.has(userId)) {
    console.log(`[deny] user=${userId} chat=${chatId}`);
    return;
  }

  // Skip commands — handled above
  if (msg.text && msg.text.startsWith("/")) return;

  const urls = extractUrls(msg);
  if (urls.length === 0) {
    await bot.sendMessage(chatId, "No URL found in that message.");
    return;
  }

  for (const url of urls) {
    try {
      const bm = await saveBookmark(url);
      const link = `${LIBRARY_BASE_URL}/dashboard/preview/${bm.id}`;
      const flag = bm.alreadyExists ? "Already saved" : "Saved";

      await bot.sendMessage(
        chatId,
        `${flag}: ${url}\n${link}`,
        {
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "Add to list 📂", callback_data: `addtolist:${bm.id}` }],
            ],
          },
        },
      );
      console.log(`[ok] user=${userId} url=${url} id=${bm.id}`);
    } catch (e) {
      await bot.sendMessage(chatId, `Failed: ${url}\n${e.message}`, {
        disable_web_page_preview: true,
      });
      console.error(`[err] user=${userId} url=${url}`, e.message);
    }
  }
});

// Callback queries from inline buttons
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = String(query.from?.id ?? "");
  const data = query.data || "";

  await bot.answerCallbackQuery(query.id);

  if (!allowed.has(userId)) return;

  // "Add to list" button — show list picker
  if (data.startsWith("addtolist:")) {
    const bookmarkId = data.slice("addtolist:".length);
    try {
      const lists = await getLists();
      if (lists.length === 0) {
        await bot.sendMessage(chatId, "No lists found. Create one in the Library first.");
        return;
      }
      const keyboard = lists.map((l) => [
        { text: `${l.icon || "📁"} ${l.name}`, callback_data: `picklist:${bookmarkId}:${l.id}` },
      ]);
      await bot.sendMessage(chatId, "Choose a list:", {
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (e) {
      await bot.sendMessage(chatId, `Failed to fetch lists: ${e.message}`);
    }
    return;
  }

  // List picked — add the bookmark
  if (data.startsWith("picklist:")) {
    const parts = data.split(":");
    // format: picklist:<bookmarkId>:<listId>
    if (parts.length < 3) {
      await bot.sendMessage(chatId, "Invalid list selection. Please try again.");
      return;
    }
    const bookmarkId = parts[1];
    const listId = parts[2];
    try {
      await addToList(listId, bookmarkId);
      await bot.sendMessage(chatId, `Added to list.`);
      console.log(`[list] user=${userId} bookmark=${bookmarkId} list=${listId}`);
    } catch (e) {
      await bot.sendMessage(chatId, `Failed to add to list: ${e.message}`);
      console.error(`[err] picklist user=${userId}`, e.message);
    }
    return;
  }
});

console.log(
  `[boot] @LibraryLibrary_bot polling — allowlist size=${allowed.size}, base=${LIBRARY_BASE_URL}`,
);
