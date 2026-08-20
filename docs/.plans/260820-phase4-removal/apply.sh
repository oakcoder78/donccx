#!/usr/bin/env bash
# TD-008 — apply after cron 01/09 is validated
# Validates canary, then removes wrappers in monthly-sync
set -e
echo "=== TD-008 pre-checks ==="
node scripts/freshdesk-canary.js 2026-09 | tail -n 20
node scripts/freshdesk-canary.js 2026-08 | head -n 15
npm run build | tail -n 10
echo "=== Applying removal ==="
# Patch is applied via this script — see patch.diff
patch -p1 < docs/.plans/260820-phase4-removal/patch.diff
echo "=== Build ==="
npm run build | tail -n 10
echo "=== Deploy (requires SUPABASE_ACCESS_TOKEN) ==="
echo "Run: node_modules/.bin/supabase functions deploy monthly-sync"
echo "If anything fails, revert: git revert HEAD && node_modules/.bin/supabase functions deploy monthly-sync"
