#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Library dev setup ==="

# Check pnpm
if ! command -v pnpm &>/dev/null; then
  echo "pnpm not found. Install it: npm install -g pnpm"
  exit 1
fi

# Copy .env from example if missing
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Copied .env.example -> .env"
  echo "IMPORTANT: Edit $ROOT/.env before starting. Fill in secrets."
else
  echo ".env already exists, skipping copy."
fi

# Install dependencies
echo "Installing dependencies..."
pnpm install --dir "$ROOT"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Choose your dev mode:"
echo ""
echo "  A) Point at production API (read-only browse from Mac):"
echo "     Set in .env:  API_URL=https://library.example.com"
echo "     Then run:     pnpm web"
echo "     Open:         http://localhost:3001"
echo ""
echo "  B) Run full local stack (needs Chrome, Meilisearch, Redis):"
echo "     1. Start infra:   docker compose up -d   (from $ROOT)"
echo "     2. Start workers: pnpm workers"
echo "     3. Start web:     pnpm web"
echo "     Open:             http://localhost:3001"
echo ""
echo "  Production instance: https://library.example.com (Linux server)"
echo "  Data lives on the Linux server. For local dev, either proxy to prod or"
echo "  copy the SQLite DB: scp server:$ROOT/data/db.db ./data/"
