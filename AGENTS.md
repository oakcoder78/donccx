# AGENTS.md

Read .agents\core-agents.md

All routing rules defined there.

## Projeto

Stack: React 18 + Vite + TailwindCSS 3 + Supabase + TanStack Query v5  
Raiz: `E:\donc\donccx`  
Dev: `npm run dev`

## Regras de Conduta

- Responda o chat sempre em Português (pt-br) mas os códigos e comentários em inglês.


## Critical rules for this repo
- Work directly on `main`; do not create branches and do not use worktrees (`CLAUDE.md`).
- If you commit, push to `origin main`.
- Do not rely on root `README.md` for project behavior (it is Supabase CLI upstream text, not this app).

### Icons Registry (src/lib/icons.js)
- SEMPRE ler o arquivo inteiro antes de modificar
- NUNCA criar exports agrupados por módulo (ex: BriefIcons, RmcIcons, ProjectIcons)
- NUNCA importar de lucide-react diretamente em componentes — sempre via este registry
- Adicionar novos ícones no export central existente, em ordem alfabética
- Padrão de adição: import { X } from 'lucide-react' no topo do arquivo + X incluído no objeto/export central
- Antes de adicionar: verificar se o ícone já existe no registry para evitar duplicatas

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

--------------------------------------------------

# context-mode — MANDATORY routing rules

context-mode MCP tools available. Rules protect context window from flooding. One unrouted command dumps 56 KB into context.

## Think in Code — MANDATORY

Analyze/count/filter/compare/search/parse/transform data: **write code** via `context-mode_ctx_execute(language, code)`, `console.log()` only the answer. Do NOT read raw data into context. PROGRAM the analysis, not COMPUTE it. Pure JavaScript — Node.js built-ins only (`fs`, `path`, `child_process`). `try/catch`, handle `null`/`undefined`. One script replaces ten tool calls.

## BLOCKED — do NOT attempt

### curl / wget — BLOCKED
Shell `curl`/`wget` intercepted and blocked. Do NOT retry.
Use: `context-mode_ctx_fetch_and_index(url, source)` or `context-mode_ctx_execute(language: "javascript", code: "const r = await fetch(...)")`

### Inline HTTP — BLOCKED
`fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, `http.request(` — intercepted. Do NOT retry.
Use: `context-mode_ctx_execute(language, code)` — only stdout enters context

### Direct web fetching — BLOCKED
Use: `context-mode_ctx_fetch_and_index(url, source)` then `context-mode_ctx_search(queries)`

## REDIRECTED — use sandbox

### Shell (>20 lines output)
Shell ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`.
Otherwise: `context-mode_ctx_batch_execute(commands, queries)` or `context-mode_ctx_execute(language: "shell", code: "...")`

### File reading (for analysis)
Reading to **edit** → reading correct. Reading to **analyze/explore/summarize** → `context-mode_ctx_execute_file(path, language, code)`.

### grep / search (large results)
Use `context-mode_ctx_execute(language: "shell", code: "grep ...")` in sandbox.

## Tool selection

0. **MEMORY**: `context-mode_ctx_search(sort: "timeline")` — after resume, check prior context before asking user.
1. **GATHER**: `context-mode_ctx_batch_execute(commands, queries)` — runs all commands, auto-indexes, returns search. ONE call replaces 30+. Each command: `{label: "header", command: "..."}`.
2. **FOLLOW-UP**: `context-mode_ctx_search(queries: ["q1", "q2", ...])` — all questions as array, ONE call (default relevance mode).
3. **PROCESSING**: `context-mode_ctx_execute(language, code)` | `context-mode_ctx_execute_file(path, language, code)` — sandbox, only stdout enters context.
4. **WEB**: `context-mode_ctx_fetch_and_index(url, source)` then `context-mode_ctx_search(queries)` — raw HTML never enters context.
5. **INDEX**: `context-mode_ctx_index(content, source)` — store in FTS5 for later search.

## Output

Terse like caveman. Technical substance exact. Only fluff die.
Drop: articles, filler (just/really/basically), pleasantries, hedging. Fragments OK. Short synonyms. Code unchanged.
Pattern: [thing] [action] [reason]. [next step]. Auto-expand for: security warnings, irreversible actions, user confusion.
Write artifacts to FILES — never inline. Return: file path + 1-line description.
Descriptive source labels for `search(source: "label")`.

## Session Continuity

Skills, roles, and decisions persist for the entire session. Do not abandon them as the conversation grows.

## Memory

Session history is persistent and searchable. On resume, search BEFORE asking the user:

| Need | Command |
|------|---------|
| What did we decide? | `context-mode_ctx_search(queries: ["decision"], source: "decision", sort: "timeline")` |
| What constraints exist? | `context-mode_ctx_search(queries: ["constraint"], source: "constraint")` |

DO NOT ask "what were we working on?" — SEARCH FIRST.
If search returns 0 results, proceed as a fresh session.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call `stats` MCP tool, display full output verbatim |
| `ctx doctor` | Call `doctor` MCP tool, run returned shell command, display as checklist |
| `ctx upgrade` | Call `upgrade` MCP tool, run returned shell command, display as checklist |
| `ctx purge` | Call `purge` MCP tool with confirm: true. Warns before wiping knowledge base. |

After /clear or /compact: knowledge base and session stats preserved. Use `ctx purge` to start fresh.



