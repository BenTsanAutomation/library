# Library Development Guide

## Production Instance

- URL: https://library.example.com
- Hosted on: Linux server (user@...)
- Services managed by systemd user units: `library-dashboard`, `library-worker`, `library-tgbot`
- Data: `/home/user/.openclaw/workspace/apps/library/data/` (SQLite)

## Multi-device Development (Linux + Mac Mini)

### Initial Mac Mini Setup

```bash
# Clone the repo (it tracks upstream library — the fork is at this path)
git clone https://github.com/your-org/library ~/library
cd ~/library

# Run the setup script
bash scripts/setup-dev.sh
```

Then edit `.env` with the approach you want (see below).

### Option A: Develop against the production API

Point the web app at the production backend. You get real data, no local infra needed. Best for frontend/UI work.

```bash
# In .env:
API_URL=https://library.example.com
NEXTAUTH_URL=http://localhost:3001
# Leave MEILI_ADDR, REDIS_URL, BROWSER_WEB_URL pointing at localhost
# (workers won't run, but the web UI will work)
```

Then:
```bash
pnpm web
# Open http://localhost:3001
```

### Option B: Full local stack

Run everything locally. Requires Docker for Chrome + Meilisearch, and Redis.

```bash
# Start infra (Chrome for crawling, Meilisearch for search)
docker compose up -d

# Redis (if not already running)
redis-server &

# Start workers (background crawling, AI summarization)
pnpm workers &

# Start web
pnpm web
```

The app will be at http://localhost:3001 with a fresh empty database.

To work with a copy of production data:
```bash
# Copy the SQLite DB from the Linux server (read the real data)
scp user@<server-ip>:/home/user/.openclaw/workspace/apps/library/data/db.db ./data/db.db
```

### Common Commands

```bash
pnpm web              # Start Next.js web UI
pnpm workers          # Start background workers
pnpm db:generate --name my_change   # Generate a DB migration after schema changes
pnpm db:migrate       # Apply DB migrations
pnpm typecheck        # TypeScript check
pnpm lint             # Lint
pnpm test             # Run tests
```

### Restarting Production Services (Linux server)

```bash
systemctl --user restart library-dashboard
systemctl --user restart library-worker
systemctl --user restart library-tgbot
```

### Cloudflare Tunnel

The public URL is managed by `main-tunnel.service` (systemd user unit) using cloudflared.
Config: `~/.cloudflared/config.yml`
