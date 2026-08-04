import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import TurndownService from "turndown";

import { createLibraryClient } from "@library/sdk";

const addr = process.env.LIBRARY_API_ADDR;
const apiKey = process.env.LIBRARY_API_KEY;

const getCustomHeaders = () => {
  try {
    return process.env.LIBRARY_CUSTOM_HEADERS
      ? JSON.parse(process.env.LIBRARY_CUSTOM_HEADERS)
      : {};
  } catch (e) {
    console.error("Failed to parse LIBRARY_CUSTOM_HEADERS", e);
    return {};
  }
};

export const libraryClient = createLibraryClient({
  baseUrl: `${addr}/api/v1`,
  headers: {
    ...getCustomHeaders(),
    "Content-Type": "application/json",
    authorization: `Bearer ${apiKey}`,
  },
});

export const mcpServer = new McpServer({
  name: "Library",
  version: "0.23.0",
});

export const turndownService = new TurndownService();
