# Implementation Plan: sync_service_log

> Created: 2026-07-27 21:00
> Brainstorm: [Design Spec](../../superpowers/specs/2026-07-27-sync-service-log-design.md)
> Backlog: TD-006

## Purpose / Big Picture

Criar tabela `sync_service_log` para rastreamento granular de execuções de sync por serviço. Atualizar `donc-api-sync` para registrar timestamps por instância. Exibir "última sincronização" no cockpit de profissionais.

## Objective

Migration SQL (tabela + índices + RLS), modificação na edge function `donc-api-sync` (INSERT/UPDATE), e exibição do timestamp no cockpit.

## Context and Orientation

- **Spec:** `docs/superpowers/specs/2026-07-27-sync-service-log-design.md`
- **Patterns:** `sync_log` table (same structure), `useSyncStatus` hook, `SettingsSyncStatus` UI
- **Constraints:** `donc-api-sync` loopa por instância → INSERT/UPDATE por instância dentro do loop
- **DB reviews:** postgres-pro, dba, optimizer — 3 índices, text ref_month, ON DELETE SET NULL, RLS restritivo

## Scope

**In:** migration SQL, donc-api-sync edge function, cockpit last sync display
**Out:** SettingsSyncStatus migration (fase 2), freshdesk/health-recalc logging (futuro), cleanup cron job (backlog)

## Progress

- [ ] Plan approved for execution.
- [ ] Phase 1 pending.

## Phases

- [ ] **Phase 1 [M]: SQL Migration** — CREATE TABLE + 3 indexes + RLS policies
- [ ] **Phase 2 [M]: Edge Function** — INSERT/UPDATE sync_service_log per instance in donc-api-sync
- [ ] **Phase 3 [S]: Frontend** — display last_sync in cockpit toolbar
- [ ] **Phase 4 [M]: Deploy** — db push + function deploy + build + push + test

## Key Changes

| File | Action |
|------|--------|
| `supabase/migrations/20260727XXXXXX_create_sync_service_log.sql` | Create |
| `supabase/functions/donc-api-sync/index.ts` | Modify (+INSERT, +UPDATE) |
| `src/pages/ProfissionaisCockpitPage.jsx` | Modify (+lastSync query + display) |

## Validation

- `npm run build` sem erros
- `supabase db push --include-all` sem erros
- `supabase functions deploy donc-api-sync` sem erros
- Cockpit mostra "Última sinc: DD/MM/AAAA HH:MM BRT"
- Sync manual via /configuracoes gera entrada com `triggered_by='manual'`
- RLS: INSERT como authenticated retorna erro

## Dependencies

Nenhuma nova.

## Risks & Mitigations

- **FK delete trava remoção de instância** → `ON DELETE SET NULL`
- **Edge function crash deixa row travada** → filtro `started_at > 2h` no cockpit; cron job futuro
- **RLS ausente permite INSERT malicioso** → INSERT/UPDATE restrito a `service_role`

## Decision Log

- 2026-07-27 — 3 índices, text ref_month, ON DELETE SET NULL, RLS service_role. Consensus from postgres-pro + dba + optimizer reviews.
- 2026-07-27 — Coexistência sync_log + sync_service_log. sync_log legacy, sync_service_log granular.

## Open Questions

None.
