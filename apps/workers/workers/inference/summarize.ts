import { and, eq } from "drizzle-orm";
import { getBookmarkDomain } from "network";

import { db } from "@library/db";
import {
  bookmarkAssets,
  bookmarks,
  bookmarkTexts,
  customPrompts,
  users,
} from "@library/db/schema";
import {
  addLogFields,
  setSpanAttributes,
  triggerSearchReindex,
  ZOpenAIRequest,
} from "@library/shared-server";
import serverConfig from "@library/shared/config";
import { InferenceClient } from "@library/shared/inference";
import logger from "@library/shared/logger";
import { buildSummaryPrompt } from "@library/shared/prompts.server";
import { DequeuedJob } from "@library/shared/queueing";
import { BookmarkTypes } from "@library/shared/types/bookmarks";
import { Bookmark } from "@library/trpc/models/bookmarks";

async function fetchBookmarkDetailsForSummary(bookmarkId: string) {
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: { id: true, userId: true, type: true, title: true },
    with: {
      link: {
        columns: {
          title: true,
          description: true,
          htmlContent: true,
          contentAssetId: true,
          crawlStatusCode: true,
          publisher: true,
          author: true,
          url: true,
        },
      },
      text: { columns: { text: true, sourceUrl: true } },
      asset: {
        columns: {
          assetType: true,
          content: true,
          fileName: true,
          sourceUrl: true,
        },
      },
    },
  });

  if (!bookmark) {
    throw new Error(`Bookmark with id ${bookmarkId} not found`);
  }
  return bookmark;
}

export async function runSummarization(
  bookmarkId: string,
  job: DequeuedJob<ZOpenAIRequest>,
  inferenceClient: InferenceClient,
) {
  if (!serverConfig.inference.enableAutoSummarization) {
    logger.debug(
      `[inference][${job.id}] Skipping summarization job for bookmark with id "${bookmarkId}" because it's disabled in the config.`,
    );
    return;
  }
  const jobId = job.id;

  logger.info(
    `[inference][${jobId}] Starting a summary job for bookmark with id "${bookmarkId}"`,
  );

  const bookmarkData = await fetchBookmarkDetailsForSummary(bookmarkId);

  // Check user-level preference
  const userSettings = await db.query.users.findFirst({
    where: eq(users.id, bookmarkData.userId),
    columns: {
      autoSummarizationEnabled: true,
      inferredTagLang: true,
    },
  });

  setSpanAttributes({
    "user.id": bookmarkData.userId,
    "bookmark.id": bookmarkData.id,
    "inference.type": "summarization",
  });
  addLogFields<"inferenceWorker.run">({
    "user.id": bookmarkData.userId,
    "bookmark.url": bookmarkData.link?.url,
    "bookmark.domain": getBookmarkDomain(bookmarkData.link?.url),
    "bookmark.content_type": bookmarkData.type,
    "crawler.status_code": bookmarkData.link?.crawlStatusCode ?? undefined,
    "inference.model": serverConfig.inference.textModel,
  });

  if (userSettings?.autoSummarizationEnabled === false) {
    logger.debug(
      `[inference][${jobId}] Skipping summarization job for bookmark with id "${bookmarkId}" because user has disabled auto-summarization.`,
    );
    return;
  }

  let textToSummarize = "";
  if (bookmarkData.type === BookmarkTypes.LINK && bookmarkData.link) {
    const link = bookmarkData.link;

    // Extract plain text content from HTML for summarization
    let content =
      (await Bookmark.getBookmarkPlainTextContent(link, bookmarkData.userId)) ??
      "";

    if (!link.description && !content) {
      logger.info(
        `[inference] No content found for link "${bookmarkId}". Skipping summary.`,
      );
      return;
    }

    textToSummarize = `
Title: ${link.title ?? ""}
Description: ${link.description ?? ""}
Content: ${content}
Publisher: ${link.publisher ?? ""}
Author: ${link.author ?? ""}
URL: ${link.url ?? ""}
`;
  } else if (
    bookmarkData.type === BookmarkTypes.TEXT &&
    bookmarkData.text?.text
  ) {
    textToSummarize = `
Title: ${bookmarkData.title ?? ""}
Note: ${bookmarkData.text.text}
${bookmarkData.text.sourceUrl ? `Source: ${bookmarkData.text.sourceUrl}` : ""}
`;
  } else if (
    bookmarkData.type === BookmarkTypes.ASSET &&
    bookmarkData.asset?.content
  ) {
    // ASSET content is the text extracted by assetPreprocessingWorker
    // (PDF text layer or vision-OCR for images).
    textToSummarize = `
Title: ${bookmarkData.title ?? bookmarkData.asset.fileName ?? ""}
Type: ${bookmarkData.asset.assetType}
Content: ${bookmarkData.asset.content}
${bookmarkData.asset.sourceUrl ? `Source: ${bookmarkData.asset.sourceUrl}` : ""}
`;
  } else {
    logger.warn(
      `[inference][${jobId}] Bookmark ${bookmarkId} (type: ${bookmarkData.type}) has no summarizable content. Skipping summary.`,
    );
    return;
  }

  if (!textToSummarize.trim()) {
    logger.info(
      `[inference][${jobId}] No content to summarize for bookmark ${bookmarkId}.`,
    );
    return;
  }

  const prompts = await db.query.customPrompts.findMany({
    where: and(
      eq(customPrompts.userId, bookmarkData.userId),
      eq(customPrompts.appliesTo, "summary"),
    ),
    columns: {
      text: true,
    },
  });

  addLogFields<"inferenceWorker.run">({
    "inference.prompt.custom_count": prompts.length,
  });

  const summaryPrompt = await buildSummaryPrompt(
    userSettings?.inferredTagLang ?? serverConfig.inference.inferredTagLang,
    prompts.map((p) => p.text),
    textToSummarize,
    serverConfig.inference.contextLength,
  );

  addLogFields<"inferenceWorker.run">({
    "inference.prompt.size": Buffer.byteLength(summaryPrompt, "utf8"),
  });

  const summaryResult = await inferenceClient.inferFromText(summaryPrompt, {
    schema: null, // Summaries are typically free-form text
    abortSignal: job.abortSignal,
  });

  if (!summaryResult.response) {
    throw new Error(
      `[inference][${jobId}] Failed to summarize bookmark ${bookmarkId}, empty response from inference client.`,
    );
  }

  addLogFields<"inferenceWorker.run">({
    "inference.summary.size": Buffer.byteLength(summaryResult.response, "utf8"),
    "inference.total_tokens": summaryResult.totalTokens,
  });

  logger.info(
    `[inference][${jobId}] Generated summary for bookmark "${bookmarkId}" using ${summaryResult.totalTokens} tokens.`,
  );

  await db
    .update(bookmarks)
    .set({
      summary: summaryResult.response,
      modifiedAt: new Date(),
    })
    .where(eq(bookmarks.id, bookmarkId));

  await triggerSearchReindex(bookmarkId, {
    priority: job.priority,
    groupId: bookmarkData.userId,
  });
}
