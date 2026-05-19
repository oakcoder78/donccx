# doncCX Hub — AGENTS.md

Routing rules in `.agents\core-agents.md`.

## Project

Stack: React 18 + Vite 6 + TailwindCSS 3 + Supabase + TanStack Query v5 + react-router-dom v7  
Root: `E:\donc\donccx`  
Entry: `src/main.jsx` → `src/App.jsx`  
Dev: `npm run dev`  
Build (only verification step, no lint/typecheck/test): `npm run build`

## Rules

- Chat always in **pt-br**; code and comments in **English**.
- Work on `main` directly — no branches, no worktrees. Push to `origin main`.
- Do NOT trust root `README.md` for app behavior (it's upstream Supabase CLI docs, not this app).

## Icons (`src/lib/icons.js`)

- **Never** import from `lucide-react` directly in components.
- **Always** use `import { Icons } from '../lib/icons'` then `<Icons.FileQuestion size={16} />`.
- Read the file before editing. Add new icons at top (import) + alphabetically in `Icons` object. Check for duplicates first.

## Environment

```env
VITE_SUPABASE_URL=        # Required, frontend
VITE_SUPABASE_ANON_KEY=   # Required, frontend
SUPABASE_SERVICE_ROLE_KEY # Local scripts only — never expose to frontend
SUPABASE_ACCESS_TOKEN     # scripts/fix-supabase-urls.js (Management API) — .env.local only
FRESHDESK_DOMAIN          # Local scripts + Edge Function
FRESHDESK_API_KEY         # Local scripts + Edge Function
RESEND_API_KEY            # Edge Function (send-email)
ANTHROPIC_API_KEY         # Edge Function (donkie-chat)
```

Supabase client (`src/lib/supabaseClient.js`) throws immediately if env vars missing.

## Auth & Routing

Centralized in `src/App.jsx`:
- `PrivateRoute` — gates authenticated pages, redirects based on `profile.status`/`role`.
- `AdminRoute` — restricts to `admin`/`manager` roles (manager also checks feature flags).
- `AuthRedirect` — redirects active users away from login.
- `AuthContext` (`src/contexts/AuthContext.jsx`) — single context provider for auth state.

Feature flags: `useFeatureFlags` hook controls feature availability per role (e.g., `donkie`, `whatsapp_atendimento`, `settings_menu`, `api_donc`, `freshdesk`).

## Supabase & Backend

- Migrations: `supabase/migrations/` (sequential numbered SQL files).
- Edge Functions: `supabase/functions/*` (12 functions). Several have `verify_jwt = false` in `config.toml` but perform their own bearer-token + role checks in code.
- Storage: Manual bucket setup (`company-logos`, `user-avatars`). See `STORAGE_SETUP.md`.
- `supabase functions deploy <name>` to deploy.

## Operational Scripts (`scripts/`)

- `node scripts/freshdesk-map-companies.js [--apply]` — maps Freshdesk companies.
- `node scripts/freshdesk-sync.js YYYY-MM [--dry-run]` — syncs monthly Freshdesk data.
- These parse `.env.local` directly; require service-role and Freshdesk secrets.

## Context-Mode Routing (plugin: `context-mode`)

`opencode.json` enables the `context-mode` MCP plugin. Rules below prevent context flooding.

### Think in Code
Analyze/parse/transform data: write JS via `context-mode_ctx_execute(language, code)`, `console.log()` only the answer. Do NOT read raw data into context.

### Blocked — do NOT retry
- `curl`/`wget` → use `ctx_fetch_and_index()` or `ctx_execute()` with fetch.
- Inline HTTP (`fetch(`, `requests.get`, `http.get`) → use `ctx_execute()`.
- Direct web fetching → use `ctx_fetch_and_index()` then `ctx_search()`.

### Redirected to sandbox
- Shell (>20 lines output) → `ctx_batch_execute()` or `ctx_execute(language: "shell")`.
- File reading for analysis → `ctx_execute_file()`.
- grep/search with large results → `ctx_execute(language: "shell", code: "grep...")`.

### Tool selection
1. **MEMORY**: `ctx_search(sort: "timeline")` — after resume, search before asking user.
2. **GATHER**: `ctx_batch_execute(commands, queries)` — one call replaces 30+.
3. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2"])` — all questions as array.
4. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)`.
5. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search()`.
6. **INDEX**: `ctx_index(content, source)` — store in FTS5.

### Output
Terse, technical. No articles, filler, pleasantries. Write artifacts to files — return path + 1-line description.

## Implementation Details Easy to Miss

- `vite.config.js` injects `__COMMIT_HASH__` at build time via `git rev-parse --short HEAD`.
- SPA rewrite in `vercel.json`: `/(.*) -> /index.html`.
- QueryClient defaults: `staleTime: 30s`, `retry: 1`, `gcTime: 5m`.
- `build.minify: false` in Vite config.
- CI: GitHub Actions workflow triggers on PR/issue comments with `/oc` or `/opencode`.
- Existing workspace may be dirty; do not revert unrelated user changes.
- `.openclaude-profile.json` contains API credentials — do not print or commit.
