# Implementation Plan: Profissionais Cockpit

> Created: 2026-07-26 19:30:00
> Brainstorm: [Design Spec](../../superpowers/specs/2026-07-26-profissionais-cockpit-design.md)

## Purpose / Big Picture

Cockpit para time financeiro consultar dados de profissionais por cliente com base no mes anterior: ativos, com acesso no mes e com OS no mes — cada metrica com delta percentual. Expansao inline mostra lista detalhada. Export CSV (sintetico/analitico) e PDF individual via window.print().

## Objective

Pagina de cockpit com 3 Postgres RPCs, hook React, pagina com accordion, feature flag, seletor de mes, busca, e export CSV/PDF.

## Context and Orientation

- **Spec:** `docs/superpowers/specs/2026-07-26-profissionais-cockpit-design.md`
- **Patterns:** `ProjectCockpitPage.jsx` (accordion), `CockpitsPage.jsx` (hub), `BriefResponsesModal.jsx` (CSV Blob), `ReportPublicPage.jsx` (window.print)
- **Data:** `client_usage.profissionais_versao` JSONB, ja populado pela sync DONC

## Scope

**In:** 3 RPCs com RLS, feature flag, pagina com accordion + export, 2 icons, hub card, rota
**Out:** agendamento, filtro CSM manual, novas deps npm

## Progress

- [ ] Plan approved for execution.
- [ ] Phase 1 pending.
- [ ] Final verification pending.

## Phases

- [ ] **Phase 1 [M]: SQL Migration** — feature flag + 3 RPC functions
- [ ] **Phase 2 [S]: Icons** — UserCheck, FileDown
- [ ] **Phase 3 [S]: Hook** — useProfissionaisCockpit.js
- [ ] **Phase 4 [L]: Page** — ProfissionaisCockpitPage.jsx
- [ ] **Phase 5 [S]: Integration** — rota, hub card, import
- [ ] **Phase 6 [M]: Deploy** — db push, build, push, test

## Key Changes

| File | Action |
|------|--------|
| `supabase/migrations/YYYYMMDD_profissionais_cockpit.sql` | Create |
| `src/lib/icons.js` | Edit (+2 icons) |
| `src/hooks/useProfissionaisCockpit.js` | Create |
| `src/pages/ProfissionaisCockpitPage.jsx` | Create |
| `src/App.jsx` | Edit (+import +route) |
| `src/pages/CockpitsPage.jsx` | Edit (+card) |

## Validation

- `npm run build` sem erros
- `supabase db push --include-all` sem erros
- Pagina carrega dados do mes anterior
- Seletor de mes funciona
- Expand carrega profissionais (spinner -> dados)
- CSV sintetico/analitico exporta corretamente
- PDF individual abre dialog
- Busca filtra
- CSM ve apenas seus clientes (RLS)

## Dependencies

Nenhuma nova. window.print nativo. CSV usa Blob + URL.createObjectURL (ja usado).

## Risks

- JSONB grande -> processado no Postgres, nao no frontend
- RLS CSM -> usa get_user_role() (SECURITY DEFINER), padrao existente
- Migration conflito -> arquivo unico, db push --include-all

## Decision Log

- 2026-07-26 — Accordion inline (nao drawer). Rationale: mais simples, sem overlay/z-index.
- 2026-07-26 — Seletor mes dropdown. Rationale: faturamento (default M-1) + auditoria.
- 2026-07-26 — window.print() para PDF. Rationale: zero deps, padrao existente.
