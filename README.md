# Library

Self-hostable bookmark-everything app with AI tagging, full-text search, and full-page archival.

## Features

- Bookmark links, notes, images, and PDFs; automatic title/description/image fetching
- AI-based automatic tagging and summarization (OpenAI or local models via Ollama)
- Full-text search of all stored content (Meilisearch)
- Lists, collaboration, bulk actions, and a rule-based management engine
- Full-page archival (monolith) and auto video archiving (yt-dlp) against link rot
- OCR for extracting text from images
- Browser extension (Chrome/Firefox), iOS/Android apps (Expo), CLI, REST API, and MCP server
- RSS auto-ingestion, importers (Chrome, Pocket, Linkwarden, Omnivore), SSO support

## Stack

Next.js (app router), tRPC, Drizzle ORM, NextAuth, Puppeteer, Meilisearch. Monorepo managed with Turborepo and pnpm.

## Getting Started

- [Installation](./docs/docs/02-installation)
- [Configuration](./docs/docs/03-configuration)
- [Using Library](./docs/docs/04-using-library)
- [Administration](./docs/docs/06-administration)
- [Development](./DEVELOPMENT.md)

## License

[AGPL-3.0](./LICENSE)
