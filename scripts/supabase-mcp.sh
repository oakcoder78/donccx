#!/usr/bin/env bash
set -euo pipefail
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKEN=$(sed -n 's/^SUPABASE_ACCESS_TOKEN=//p' "$BASE_DIR/.env.local" | tr -d '"' | tr -d "'")
if [ -z "$TOKEN" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN not found in .env.local" >&2
  exit 1
fi
exec npx -y mcp-remote \
  "https://mcp.supabase.com/mcp?project_ref=etfeqblaeuhaobefxilp&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching" \
  --header "Authorization: Bearer ${TOKEN}" \
  --transport http-first
