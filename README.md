# doncCX Hub

Internal CSM / Sales / Finance workspace (React + Supabase). Production: https://donccx-donccx.vercel.app

## Stack

React 18 + Vite 6 + TailwindCSS 3 + Supabase + TanStack Query v5 + react-router-dom v7.

## Run

```bash
npm run dev    # local dev
npm run build  # verification (only check before pushing)
```

No local Supabase stack — DB/functions changes go directly to production
(`supabase db push --include-all`, then test in prod).

## Docs

- Agent contract: `AGENTS.md` (start here if you are an AI agent)
- Docs map: `docs/README.md`
- Changelog: `docs/CHANGELOG.md` · Backlog: `docs/backlog.md`
