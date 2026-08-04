# Library Development Guide

## Setup

```bash
git clone https://github.com/BenTsanAutomation/library
cd library
bash scripts/setup-dev.sh
```

Then edit `.env` (see `docs/docs/03-configuration` for all options).

## Running the full local stack

Requires Docker (Chrome for crawling, Meilisearch for search) and Redis.

```bash
docker compose up -d      # Chrome + Meilisearch
redis-server &            # if not already running
pnpm workers &            # background crawling, AI summarization
pnpm web                  # Next.js web UI
```

The app will be at http://localhost:3001 with a fresh empty database.

## Common Commands

```bash
pnpm web              # Start Next.js web UI
pnpm workers          # Start background workers
pnpm db:generate --name my_change   # Generate a DB migration after schema changes
pnpm db:migrate       # Apply DB migrations
pnpm typecheck        # TypeScript check
pnpm lint             # Lint
pnpm test             # Run tests
```
