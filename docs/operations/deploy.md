---
status: vivo
owner: backend
verified: 2026-09-07
expires: 2026-12-07
supersedes: []
---

# Deploy (production-only)

No local Supabase stack. Sequence:

1. `npm run build` — verify frontend compiles
2. Edit/commit migration files in `supabase/migrations/` (sequential `YYYYMMDDHHMMSS_name.sql`)
3. `supabase db push --include-all` — apply pending migrations
4. `supabase functions deploy <name>` — deploy each changed function (`supabase/functions/*`, 14 + `_shared`)
5. Vercel auto-deploys on `git push origin main`
6. Test on https://donccx-donccx.vercel.app

Notes: several functions have `verify_jwt = false` in `config.toml` but enforce
bearer-token + role checks in code. Storage one-shot setup: `storage.md`.
Secrets: never frontend (`SERVICE_ROLE_KEY` server-side only); see `AGENTS.md` env table.
