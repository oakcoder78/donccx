# AGENTS.md

## Critical rules for this repo
- Work directly on `main`; do not create branches and do not use worktrees (`CLAUDE.md`).
- If you commit, push to `origin main`.
- Do not rely on root `README.md` for project behavior (it is Supabase CLI upstream text, not this app).

## Verified stack and shape
- Single-package Vite app (React 18 + TailwindCSS 3 + TanStack Query v5 + Supabase JS).
- App entry: `src/main.jsx` -> `src/App.jsx`.
- Routing/auth gate lives in `src/App.jsx` (role/status redirects and protected routes are centralized there).
- Supabase browser client is `src/lib/supabaseClient.js` and throws immediately if env vars are missing.

## Local dev and verification
- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build (main verification step): `npm run build`
- Local preview: `npm run preview`
- There is no configured lint/typecheck/test script in `package.json`; use `npm run build` as the default safety check.

## Environment + secrets
- Required frontend env vars (`.env.local`):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Extra local script secrets (do not expose to frontend):
  - `SUPABASE_SERVICE_ROLE_KEY`, `FRESHDESK_API_KEY`, `FRESHDESK_DOMAIN`
- Treat `.openclaude-profile.json` as sensitive (contains API credential material); do not print or commit secrets.

## Supabase and backend workflow
- SQL migrations live in `supabase/migrations` (sequential numbered files).
- Edge Functions live in `supabase/functions/*`.
- `supabase/config.toml` sets `[functions.freshdesk-proxy] verify_jwt = false`; function still performs its own bearer-token + role checks in code.
- `STORAGE_SETUP.md` documents manual bucket/policy setup and deploy flow (`supabase functions deploy create-user`).

## Operational scripts (root `scripts/`)
- `node scripts/freshdesk-map-companies.js` generates/updates `scripts/freshdesk-mapping.json`.
- `node scripts/freshdesk-map-companies.js --apply` writes approved mappings to `clients.freshdesk_company_id`.
- `node scripts/freshdesk-sync.js YYYY-MM [--dry-run]` syncs Freshdesk monthly data.
- These scripts parse `.env.local` themselves and require service-role/Freshdesk secrets.

## Implementation details easy to miss
- `vite.config.js` injects `__COMMIT_HASH__` at build time via `git rev-parse --short HEAD` (falls back to `"dev"` outside git).
- SPA rewrite is configured in `vercel.json` (`/(.*) -> /index.html`).
- Existing workspace may be dirty; do not revert unrelated user changes.
