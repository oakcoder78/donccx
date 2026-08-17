#!/usr/bin/env bash
set -euo pipefail
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKEN=$(sed -n 's/^GITHUB_PERSONAL_ACCESS_TOKEN=//p' "$BASE_DIR/.env.local" | tr -d '"' | tr -d "'")
if [ -z "$TOKEN" ]; then
  echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN not found in .env.local" >&2
  exit 1
fi
exec npx -y mcp-remote \
  "https://api.githubcopilot.com/mcp/" \
  --header "Authorization: Bearer ${TOKEN}" \
  --transport http-first