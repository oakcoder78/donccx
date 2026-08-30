# Backlog — doncCX Hub

> Catálogo de débitos técnicos, refactors pendentes e ideias de feature.
> Diferente de um SDD: aqui ficam itens **pré-priorização**. Itens que viram
> trabalho ativo saem do backlog e migram para um SDD dedicado em `docs/sdd/`.

## How to use

1. **New item:** copy the template at the bottom, assign the next ID (`TD-###` for Tech Debt / Refactor, `IDEA-###` for Ideas), add to "Open Items".
2. **Triaging:** bump Priority; mark `Status: Ready` when scope is clear and effort is estimated.
3. **Activating:** when work starts, create or link a SDD in `docs/sdd/` and set `Status: Active → docs/sdd/<name>-sdd.md`.
4. **Closing:** when shipped, move the entry to "Closed Items" with commit hash + date. Do not delete.
5. **Cancelling:** keep the entry in Open Items, set `Status: Cancelled` with a one-line reason.

## Summary

| ID | Type | Title | Priority | Status | Linked SDD |
|---|---|---|---|---|---|
| TD-001 | Tech Debt | Drop `clients.app_code` / `clients.url_donc` (backfill + drop columns) | M | Done | — |
| TD-002 | Tech Debt | Desativar legacy API keys e migrar frontend para `sb_publishable_*` | H | Done | — |
| TD-003 | Tech Debt | Migrar RMC para dados do n8n (os_criadas, histórico) | M | Done | — |
| TD-004 | Tech Debt | Adicionar validação Zod no operational-report-sync | L | Backlog | — |
| TD-005 | Tech Debt | Migrar health score de active_users para profissionais_versao | H | Backlog | — |
| TD-006 | Refactor | Tabela sync_service_log para rastreamento independente por serviço | H | Done | `docs/superpowers/specs/2026-07-27-sync-service-log-design.md` |
| TD-007 | Tech Debt | Investigar provisionamento legado do oak-donc-reports | L | Backlog | — |
| TD-008 | Tech Debt | Fechamento Phase 4 — remover wrappers legados em monthly-sync | M | Backlog | `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` |

---

## TD-006 — Tabela `sync_service_log` para rastreamento independente por serviço

**Type:** Refactor
**Priority:** H
**Status:** Backlog
**Origin:** 2026-07-27 — sync_log atual só rastreia o orquestrador `monthly-sync`, não cada serviço individual. Serviços podem ser executados manualmente em datas diferentes e precisam de timestamps independentes.
**Linked SDD:** —
**Related commits:** —

### Context

Cada serviço (`donc-api`, `freshdesk`, `health-recalc`) pode ser disparado manualmente (via `/configuracoes` > API DONC, Freshdesk) ou via cron (`monthly-sync` orquestrador). Hoje o `sync_log` só registra o orquestrador com um timestamp único, misturando todos os serviços. Exemplo real:

```
03/07 - Freshdesk manual         → sem registro no sync_log
15/07 - DONC manual              → sem registro no sync_log
01/08 - Cron dispara tudo        → sync_log: 01/08 00:01 (todos no mesmo timestamp)
```

O cockpit de profissionais precisa exibir "última sincronização da API DONC" — não do orquestrador. O `SettingsSyncStatus` também se beneficiaria de granularidade por serviço.

### Proposed approach

1. **Migration** — criar `sync_service_log`:
   ```sql
   CREATE TABLE sync_service_log (
     id            bigint generated always as identity primary key,
     service_name  text not null,              -- 'donc-api' | 'freshdesk' | 'health-recalc'
     status        text not null check (status in ('running','success','failed')),
     started_at    timestamptz not null default now(),
     finished_at   timestamptz,
     triggered_by  text not null default 'manual',  -- 'manual' | 'cron' | 'client-sync'
     ref_month     text,                        -- YYYY-MM
     summary       jsonb,                       -- { synced: N, failed: N }
     error_message text
   );
   ```

2. **donc-api-sync** — INSERT `{service_name:'donc-api', status:'running'}` no início, UPDATE `{status:'success'/'failed', finished_at, summary}` no fim. Aceitar parâmetros `triggered_by` e `ref_month` do chamador.

3. **monthly-sync** — ao chamar cada sub-serviço, repassar `triggered_by='cron'` + `ref_month`. Cada serviço registra seu próprio log independente.

4. **Frontend** — migrar `SettingsSyncStatus` + `useSyncStatus` de `sync_log` para `sync_service_log`. Cockpit de profissionais faz query `WHERE service_name='donc-api' AND ref_month=X AND status='success'`.

### Files

- `supabase/migrations/` (Create — tabela sync_service_log)
- `supabase/functions/donc-api-sync/index.ts` (Modify — INSERT/UPDATE no sync_service_log)
- `supabase/functions/monthly-sync/index.ts` (Modify — repassar triggered_by/ref_month)
- `src/hooks/useSyncStatus.js` (Modify — query sync_service_log)
- `src/components/settings/SettingsSyncStatus.jsx` (Modify — adaptar UI)
- `src/pages/ProfissionaisCockpitPage.jsx` (Modify — exibir timestamp DONC)

### Risks

- Refatoração pesada — 3 edge functions + frontend + migration
- `monthly-sync` precisa repassar `triggered_by` e `ref_month` corretamente para cada sub-serviço
- Migração do `SettingsSyncStatus` pode quebrar UI existente — deploy atômico necessário
- `sync_log` antigo deve ser mantido como fallback ou removido após migração completa

### What was done (Fase 1)

1. **Migration `20260727210000`** — tabela `sync_service_log` + 3 índices + RLS
2. **donc-api-sync** — INSERT/UPDATE `sync_service_log` por instância com `triggered_by`
3. **Cockpit** — query `sync_service_log` para exibir timestamp na toolbar
4. **Migration `20260728200000`** — RLS desabilitada, `GRANT SELECT TO anon, authenticated`

### Known issues

- ~~**❌ Timestamp não aparece no cockpit**~~ — **Resolvido em 2026-07-28** (`a685e9f` + `2f14ef5`). Causa raiz: `queryFn` retornava `{data, error}` do supabase enquanto o destructuring `const { data: lastSync }` esperava o row direto. QueryFn agora retorna `data` explicitamente, com `throw error` em caso de falha.
- ~~**❌ Over-engineering**~~ — **Rejeitado como rejected alternative (2026-07-28).** Manter `sync_service_log` abre caminho para granularidade por `instance_id` (cockpit pode futuramente mostrar "última sync por cliente") e para a fase 2 (migrar `SettingsSyncStatus` de `sync_log` para `sync_service_log` agrupando por `service_name`).
- **Fase 2 pendente** — migrar `SettingsSyncStatus` + `useSyncStatus` de `sync_log` para `sync_service_log`.

### Closed

**Date:** 2026-07-28
**Commits:** `f0a5ce2` (migration + EF), `8d7ecb5` (fix .catch), `9722bbc` (RLS + fallback), `606821b` (restore CSV), `6eb4a8f` (disable RLS + grant), `7c8c90a` (staleTime=0), `0683cd4` (docs), `a685e9f` (never-synchronized fallback + drop PUBLIC policy), `2f14ef5` (queryFn return data), `ff6581c` (months from sync_service_log + drop YYYY-MM label), `c77815c` (truncate nome), `3c252e1` (widen nome to 260px)
**Linked SDD:** `docs/superpowers/specs/2026-07-27-sync-service-log-design.md`
**Linked plan:** `docs/.plans/260727-2100-sync-service-log/`

---

## TD-007 — Investigar provisionamento legado do `oak-donc-reports`

**Type:** Tech Debt
**Priority:** L
**Status:** Backlog
**Origin:** 2026-08-16 — auditoria identificou seis registros em `clients` cujos IDs coincidem com `contrato_saas_id`. O código versionado do `operational-report-sync` não cria clientes, mas o serviço externo `oak-donc-reports` participa da coleta e pode ter criado esses dados em uma versão legada.
**Linked SDD:** —
**Related:** `client_id_reconciliation`, `docs/system/integration-points.md`

### Context

O fluxo externo é:

```text
oak-donc-reports / n8n → coleta e parser dos CSVs → operational-report-sync → client_operational_reports
```

Os registros suspeitos foram criados em lote, sem `audit_logs`, e alguns relatórios foram gravados neles logo depois. A origem exata da criação precisa ser confirmada no código e nos logs da VPS que executa `oak-donc-reports`.

### Scope

- Revisar o endpoint `/clients` e rotinas antigas de provisionamento.
- Verificar se `saas_id` já foi usado como `clients.id` ou como fallback de criação.
- Correlacionar logs da VPS com os horários dos seis registros.
- Confirmar se o serviço ainda possui comportamento legado em produção.
- Corrigir o serviço externo se ainda houver criação indevida.
- Documentar o contrato correto: `saas_id` identifica `client_donc_instances`, nunca `clients.id`.

### Acceptance

- Origem dos seis registros classificada com evidência de código ou log.
- Nenhum caminho externo cria cliente a partir de contrato SaaS.
- Serviço externo trata `404`/`409` da Edge Function sem criar fallback indevido.
- Contrato de integração e procedimento de recuperação documentados.

---

## TD-008 — Fechamento Phase 4 — remover wrappers legados em monthly-sync

**Type:** Tech Debt
**Priority:** M
**Status:** Backlog
**Origin:** 2026-08-20 — `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` marcado `Done` com §4.6/§4.7 100% e Phase 4 estabilizada (canários 2026-06/07/08). Resta limpeza cosmética: `supabase/functions/monthly-sync/index.ts:41-53` mantém 4 wrappers que só delegam para `supabase/functions/_shared/freshdesk.ts`.
**Linked SDD:** `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` (Phase 4, Implementation Log)
**Related:** `supabase/functions/_shared/freshdesk.ts`, `supabase/functions/monthly-sync/index.ts`, `scripts/freshdesk-canary.js`, commits `7c4e93e`/`90b6972`/`87c59cb`

### Context

`monthly-sync` importa canônico com alias (`fdGetCanonical`, `getGroupsMapCanonical`…) e expõe 4 wrappers idênticos (`getGroupsMap`, `fetchTicketsByCompany`, `fetchContactsByCompany`, `processTicketsToSupport`) apenas para preservar fallback legado via `isCanonicalEnabled`. Pós-estabilização, fallback não é mais necessário como código — kill switch `freshdesk_config.freshdesk_canonical_enabled` permanece como rollback de dados, não de código. `src/lib/freshdeskSync.js` é canônico próprio via `freshdesk-proxy` e não deve ser tocado (Deno vs Vite).

### Scope

- [ ] Aguardar cron `01/09 00:01 UTC` (pg_cron → `monthly-sync`) sem disparo manual.
- [ ] Validar: `node scripts/freshdesk-canary.js 2026-09` (Rev.1, `source=freshdesk`, `run_id` novo, `published`), `2026-08` sem regressão, `2026-07` Rev.2 preservado, `History` mostra `01/09 success: 13 empresas · donc · health`, `sync_log` sem `failed`/`running` preso.
- [ ] Remover `supabase/functions/monthly-sync/index.ts:41-53` (4 wrappers) e trocar import para `import { getGroupsMap, fetchTicketsByCompany, fetchContactsByCompany, processTicketsToSupport, isCanonicalEnabled } from "../_shared/freshdesk.ts"` direto.
- [ ] Manter `isCanonicalEnabled` + `freshdesk_config.freshdesk_canonical_enabled` até `01/10` como kill switch de rollback (reverter commit se falhar).
- [ ] `npm run build` + `node_modules/.bin/supabase functions deploy monthly-sync` (única função alterada).
- [ ] Atualizar `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` Implementation Log com `Removal: Done` e `docs/backlog.md` → Done.

### Non-scope

- Não alterar `src/lib/freshdeskSync.js` (duplicação intencional frontend vs Edge).
- Não remover `isCanonicalEnabled`/kill switch antes de 01/10.
- Não tocar `donc-api-sync`/`health-recalc` (fora do SDD).

### Acceptance

- `monthly-sync` sem wrappers (`grep -n "getGroupsMapCanonical" ` retorna 0).
- `npm run build` OK, `supabase functions deploy monthly-sync` OK, canário `2026-09` OK pós-deploy.
- Rollback documentado: reverter commit + `upsert freshdesk_canonical_enabled=false` se necessário.
- SDD Implementation Log e backlog marcados Done.

### Files

- `supabase/functions/monthly-sync/index.ts` (Modify — remover wrappers, importar direto de `_shared/freshdesk.ts`)
- `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` (Modify — log `Removal: Done`)
- `docs/backlog.md` (Modify — TD-008 → Done)

### Risks

- Se Freshdesk mudar grupos/N3 entre 20/08 e 01/09, `getGroupsMap` pode quebrar — coberto por `withRetry` 429/5xx, mas manter kill switch até 01/10.
- Deploy esquecido após edit → usar `node_modules/.bin/supabase` (WSL) conforme `Project Gotchas`.

---

## TD-005 — Migrar health score de `active_users` para `profissionais_versao`

**Type:** Tech Debt
**Priority:** H
**Status:** Backlog
**Revisitar:** Outubro 2026 (3 meses de dados populados em `profissionais_versao`)
**Origin:** 2026-07-26 — `profissionais_versao` JSONB substituirá `active_users` como fonte canônica; health score ainda usa o campo antigo. Cockpit de profissionais já consome `profissionais_versao`.
**Linked SDD:** —
**Related:** `docs/superpowers/specs/2026-07-26-profissionais-cockpit-design.md`, `docs/.plans/260726-1930-profissionais-cockpit/`

### Context

O health score calcula a dimensão "Uso" usando `client_usage.active_users` (contagem pré-agregada de ativos). O `profissionais_versao` (JSONB) é a nova fonte canônica com dados por profissional. O cockpit de profissionais já filtra `WHERE ativo = true` no JSONB. O health score precisa migrar para a mesma fonte para manter consistência.

**Riscos identificados (architect + product review 2026-07-26):**
- Usar `.length` do array conta profissionais inativos também — precisa filtrar `ativo = true`
- Meses anteriores à migration (jul/2026) têm `profissionais_versao = NULL` — backfill obrigatório
- Frontend (`useHealthScore.js`, `useDonkie.jsx`) não pode transferir JSONB inteiro — precisa de coluna integer pré-computada
- 15+ arquivos leem `active_users` (dashboard, health, relatórios, Donkie, sync)

### Proposed approach

1. **Migration SQL** — `ALTER TABLE client_usage ADD COLUMN profissionais_ativos integer`
2. **donc-api-sync** — popular `profissionais_ativos` como `COUNT WHERE ativo = true` do JSONB
3. **Backfill** — popular meses históricos a partir do `donc_snapshot.profissionais.ativos`
4. **Fallback** — `COALESCE(profissionais_ativos, active_users)` durante 3 meses de transição
5. **Migrar consumers** — `health-recalc/index.ts`, `healthScore.js`, `useHealthScore.js`, `useDonkie.jsx`
6. **Verificar** — snapshot de scores de 5 clientes antes/depois para evitar regressão

### Files

- `supabase/migrations/` (Create — add column + backfill)
- `supabase/functions/donc-api-sync/index.ts` (Modify — popular profissionais_ativos)
- `supabase/functions/health-recalc/index.ts` (Modify — ler profissionais_ativos)
- `src/lib/healthScore.js` (Modify — idem)
- `src/hooks/useHealthScore.js` (Modify — select profissionais_ativos)
- `src/hooks/useDonkie.jsx` (Modify — idem, 2 lugares)
- `docs/modules/health-score.md` (Modify — documentar nova coluna)
- `docs/sdd/health-score-dashboard-sdd.md` (Modify — atualizar spec)

### Risks

- Score de Uso pode mudar para dezenas de clientes na primeira recalc pós-migração
- CSMs priorizam carteira pelo health score — ordenação pode mudar radicalmente
- Comunicar CSMs com 1 semana de antecedência se scores mudarem >5 pts em clientes ABC-A
| IDEA-001 | Idea | UI Pattern Library — Phase 2 (8 patterns restantes) | M | Ready | `docs/sdd/ui-patterns-phase2-sdd.md` |
| IDEA-002 | Feature | Dashboard v3 (`/dashboard` para todos) + monolito → `/labs` admin-only | H | Active | `docs/sdd/labs-dashboard-sdd.md` |

---

## IDEA-002 — Dashboard v3 + monolito em Labs

**Type:** Feature / Refactor
**Priority:** H
**Status:** Active → `docs/sdd/labs-dashboard-sdd.md`
**Linked SDD:** `docs/sdd/labs-dashboard-sdd.md`
**Origin:** 2026-08-29 — o SDD do "Labs Dashboard" descrevia `/labs/dashboard` como a nova dash minimalista ("Genérica", 5 blocos, sem MRR/OS) e `/dashboard` como o monolito legado. Decisão do stakeholder **inverteu**: o mock `docs/mock/meu-dia-generic-v3.html` vira a dashboard principal em `/dashboard` para os 6 papéis; o monolito (`DashboardPage.jsx`) vai para `/labs/dashboard` sob `AdminOnlyRoute`.

### Context

A v3 evoluiu (v1→v3) de "Genérica" para uma dashboard completa que re-incorpora o layout do monolito (Pulso / Portfólio / Operacional) + HERO por papel + seções novas (YTD "Nossa força em Números", Mapa vivo). O SDD foi reescrito para refletir a arquitetura-alvo e o estado real do código.

### Gap analysis (resumo — detalhe no SDD §1)

- `src/lib/scoring.js`, `src/components/dashboard/BrazilMap.jsx`, `src/hooks/useLabsClients.js` **já existem** (o SDD antigo mandava criar). `BrazilMap` e `useLabsClients` estão órfãos.
- Não existe agregação YTD nem média móvel de 90 dias — tudo é mês-vs-mês. Full-fidelity exige RPCs novos.
- Gotcha A3 (vazamento de MRR via `CLIENT_SELECT = *`) vira **crítico** com `/dashboard` global → masking no banco (`get_finance_summary` RPC / view).
- `useGreeting` só produz 2 linhas; a 3ª ("Dados referente a jul/26") vem do status de sincronização (`sync_log`), calculada na página. `identity.ts` não tem pools `sales`/`finance`.
- Flag `labs_dashboard` aposentada (não faz mais sentido).

### Phases (SDD §6)

0 Foundation (**done**) · 1 Route scaffold + flag (**done, 2026-08-29**) · 2 Data foundation (**done, 2026-08-30**) · 3 v3 build + swap — **v3 = `/dashboard` para os 6 papéis (done, 2026-08-30); flag `dashboard_v3` mantida como kill-switch** · **4 Cockpits por papel (roadmap) — próxima** · 5 Matriz de acesso Empresas · 6 Aposentar monolito.

### Progresso

- **Fase 1 shipada:** `/dashboard` → `DashboardRoute` (monolito por padrão; v3 shell para admin via flag `dashboard_v3`, ligada); `/labs/dashboard` → monolito sob `AdminOnlyRoute`; `labs_dashboard` aposentada; `MeuDiaV3Page` shell (7 placeholders). Verificado em prod pelo admin.
- **2 hotfixes de auth** (bugs pré-existentes expostos pelo primeiro deploy): logout resiliente a sessão expirada (`3d1ed81`) + Web Locks do gotrue desligado (`89c022e`, deadlock a cada deploy).
- **Fase 2 shipada (2026-08-30):** 3 migrations em prod (`get_dashboard_ytd`, `get_operational_90d_avg`, `get_finance_summary` role-guarded; RLS write de `activities` p/ csm/sales); hooks `useDashboardClients` / `useDashboardYtd` (+ `useOperational90dAvg`) / `useOperationalDeltas` (+ `useOpClientHistory`); helpers de mês + `dataRefMonth` em `scoring.js`; pools `sales`/`finance` no greeting. A3 mitigado para o `/dashboard`.
- **Fase 3 — blocos + swap (2026-08-30):** `MeuDiaV3Page` real (7 blocos + `DashboardHeader`), `ui/Drawer.jsx` compartilhado (+ `/health` migrado), `BrazilMap` interativo + degrade, `ClientHealthDrawer` qaItem, `:focus-visible`/reduced-motion globais, `BlockBoundary` por bloco. **`/dashboard` = v3 para os 6 papéis** (migration `20260830000003` amplia a flag + `enabled=true`); flag mantida como **kill-switch por banco** (`enabled=false` → monolito p/ todos, sem deploy). Analyst: carve-out em `/dashboard` + link na navbar.
- **Follow-up (não urgente):** limpar a flag/wrapper — deletar `DashboardRoute.jsx`, `/dashboard` → `MeuDiaV3Page` direto, `DELETE` da flag, tirar de `SettingsFeatureFlags`. ARIA do "Ver como" (Navbar). `handleSync` inline no bloco Operacional.

### Files
- Docs: `docs/sdd/labs-dashboard-sdd.md` (reescrito), `docs/modules/meu-dia-dashboard.md` (novo), `docs/modules/{pages,contexts,lib}.md`, `.agents/docs-index.md`, `docs/CHANGELOG.md`
- Código Fase 1: `src/App.jsx`, `src/pages/DashboardRoute.jsx` + `src/pages/MeuDiaV3Page.jsx` (novos), `src/pages/labs/LabsDashboardPage.jsx`, `src/components/layout/Navbar.jsx`, `src/components/settings/SettingsFeatureFlags.jsx`, `src/contexts/AuthContext.jsx`, `src/lib/supabaseClient.js`, `supabase/migrations/20260829000000_*.sql`
- Fases 2-3: `src/components/dashboard/v3/*`, `src/components/ui/Drawer.jsx`, hooks + migrations (ver SDD "Files to be touched")

---

## IDEA-001 — UI Pattern Library — Phase 2

**Type:** Idea
**Priority:** M
**Status:** Ready
**Linked SDD:** `docs/sdd/ui-patterns-phase2-sdd.md`
**Origin:** 2026-06-14 — audit found 20 undocumented UI pattern categories after initial library (17 sections) was created

### Context

The initial `docs/ui-patterns.md` covered 17 core patterns (table, toggle, badge, progress bar, card, etc.) plus 7 high-impact ones (button, avatar, search, filter bar, tabs, confirmation dialog, toast). An audit of the full codebase found 8 more categories in active use that have no documented standard.

### Patterns to add

| Section | Pattern | Effort |
|---------|---------|--------|
| 25 | Collapsible / Accordion | low |
| 26 | Phase / Step Indicator | low |
| 27 | Summary / KPI Bar | low |
| 28 | File Upload | medium |
| 29 | Data Visualization | medium |
| 30 | Activity / Timeline Item | medium |
| 31 | Section Header | low |
| 32 | Responsive Layout | low |

### Files
- `docs/ui-patterns.md` — Add sections 25-32
- `docs/CHANGELOG.md` — Add entry

### Acceptance
- Each section has exact Tailwind classes, source references, and usage examples
- Build passes

---

## Closed Items

### TD-002 — Desativar legacy API keys e migrar frontend para `sb_publishable_*`

**Type:** Tech Debt
**Priority:** H
**Status:** Done
**Closed:** 2026-06-11 — legacy JWT-based API keys (anon + service_role) desativadas no Dashboard às 18:46Z; service_role JWT exposta efetivamente revogada.
**Origin:** 2026-06-11 — auditoria de segurança após exposição da service_role JWT; Edge Functions e scripts já compatíveis com `sb_secret_*` (helper `_shared/auth.ts`).
**Linked SDD:** —
**Related commits:** `5dd0968` (auth hardening + compat sb_secret), `742e1c8` (RLS freshdesk_config admin+manager).

### Context

A service_role JWT exposta só morre de fato quando as legacy API keys são desativadas no Dashboard. Pré-requisitos entregues no `5dd0968`: funções usam `getServiceKey()` (lê `SUPABASE_SECRET_KEYS`), S2S usa `SYNC_WEBHOOK_SECRET`, scripts aceitam `SUPABASE_SECRET_KEY`.

### What was done

1. Criadas chaves novas no Dashboard: `sb_publishable_PEDDXC13…` e secret key `default`.
2. `VITE_SUPABASE_ANON_KEY` (Vercel + `.env.local`) trocada para a publishable key; `SUPABASE_SECRET_KEY` local adicionada. supabase-js 2.101.1 aceita as chaves novas sem mudança de código.
3. Verificado server-side (Gate B): com a service_role legada fora do ambiente, `donc-api-sync` ainda responde 200 — prova de que `SUPABASE_SECRET_KEYS` está em uso. Frontend confirmado lendo via publishable; legacy anon passou a retornar 401 "Legacy API keys are disabled".
4. Legacy keys desativadas no Dashboard.

### Notes / lessons

- Vite "assa" `VITE_SUPABASE_ANON_KEY` no **build**: trocar a env exige rebuild, e navegadores com o bundle antigo em cache (legacy anon) quebram ao desativar a legacy até um hard refresh. O "Disable JWT-based API keys" desliga anon **e** service_role juntos — não dá para separar.
- Reversível: legacy keys podem ser reativadas no Dashboard se algum cliente esquecido aparecer.

### TD-001 — Drop `clients.app_code` / `clients.url_donc`

**Type:** Tech Debt
**Priority:** M
**Status:** Done
**Closed:** 2026-06-09 — migration `253b590`
**Origin:** 2026-06-03 — session where the instances list started reading `url_donc` / `app_code` from `client_donc_instances`; the matching columns on `clients` were soft-deprecated instead of dropped.
**Linked SDD:** —
**Related commits:** `4a8567b` (table added in instances list), `a9c36d2` (soft deprecation in form + display), `253b590` (backfill + drop migration)

### Context

As colunas `clients.app_code` e `clients.url_donc` ficaram órfãs: sem input no `ClientForm`, sem `InfoRow` no card navy de `ClientSubDados`, mas continuam existindo no banco e são escritas pela rota de upsert do form removido (via payload que também foi limpo — hoje o Supabase ignora chaves desconhecidas, mas o payload está semanticamente fora de sincronia com o schema).

A tabela canônica é `client_donc_instances`, que carrega esses campos por contrato SaaS desde a migration `020_donc_api_integration`.

### Approach

1. **Backfill:** copia `url_donc` e `app_code` de `clients` para `client_donc_instances` onde a instância ainda tem NULL. Nunca sobrescreve valores existentes.
2. **Drop columnas:** `ALTER TABLE clients DROP COLUMN app_code, DROP COLUMN url_donc;`
3. **Verificação:** build limpo, frontend sem regressão — tabela de instâncias em `/empresas/:id` continua exibindo URL e App Code.

### Files

- `supabase/migrations/20260603000000_drop_clients_appcode_urldonc.sql` — backfill + drop em um único arquivo.
- Sem mudanças de frontend (já removidas em `a9c36d2`).

### Risks

- **Interno:** zero readers dessas colunas em `src/`, `supabase/functions/` ou `scripts/`. Edge Functions e scripts não as referenciam.
- **Externo:** BI, exports ou integrações fora deste repositório que leiam `clients.app_code` / `clients.url_donc` quebrariam. Sem visibilidade aqui — registrar no log de deploy se houver essa dependência.
- **Dados:** backfill cobre apenas primeira instância por cliente sem valor. Se uma empresa tem múltiplas instâncias e só uma delas estava populada, o backfill não sobrescreve — conservador e desejado.

---

## TD-003 — Migrar RMC para dados do n8n (os_criadas, histórico)

**Type:** Tech Debt
**Priority:** M
**Status:** Done
**Closed:** 2026-06-12 — frontend migrado para `client_operational_reports` como fonte principal
**Origin:** 2026-06-11 — dados do n8n (`data_os.sumario.por_tipo`) têm estrutura aninhada `{ "Tipo": { total_os: N } }` diferente do esperado pelo frontend; alguns campos podem estar ausentes ou em formato inconsistente.
**Linked SDD:** —
**Related commits:** `27152ee`, `f32e1c5`, `bce71a4`

### What was done

1. **`os_criadas` + delta** — migrado de `usage[].os_created` para `opCurrent.data_os.sumario.total_os` (n8n)
2. **`grafico_historico` (12 meses)** — migrado de `client_usage` para `client_operational_reports`; gráfico exibe meses disponíveis (cresce conforme n8n acumula)
3. **`active_users`** — mantido em `client_usage` (n8n não envia esse dado ainda)
4. **`USAGE` helper** — removido (dead code)
5. **Query `client_usage`** — reduzida para só `ref_month, active_users`

### Files
- `src/lib/reportFields.js` (Modify — resolves de os_criadas + delta)
- `src/pages/ReportEditorPage.jsx` (Modify — query opHistory + opHistory state)
- `src/lib/reportGenerator.js` (Modify — barChartV, slideData, slideEscala, generateReportHTML)

### Remaining
- Validação Zod do payload n8n postergada → TD-004

---

## TD-004 — Adicionar validação Zod no operational-report-sync

**Type:** Tech Debt
**Priority:** L
**Status:** Backlog
**Origin:** 2026-06-12 — schema do n8n ainda em evolução; postergado até formato estabilizar
**Linked SDD:** —
**Related commits:** —

### Context
O payload do n8n (`data_os`, `data_produtividade`, `data_problemas`) não tem validação de schema — é `Record<string, unknown>` na edge function. Erros de formato só aparecem no frontend. O `por_tipo` ainda é normalizado ad-hoc no frontend (`reportGenerator.js:572-574`).

### Proposed approach
1. Adicionar Zod schema em `operational-report-sync/index.ts`
2. Normalizar `por_tipo` na edge function (remover adaptação do frontend)
3. Retornar 400 com detalhes se payload não validar

### Files
- `supabase/functions/operational-report-sync/index.ts` (Modify — adicionar validação Zod)

### Risks
- Quebrar pipeline se n8n enviar campo novo que o schema rejeite
- Esperar formato do n8n estabilizar antes de implementar

---

## Template — copy to add a new item

```markdown
## [ID] — [Short title]

**Type:** Tech Debt | Refactor | Idea
**Priority:** H | M | L
**Status:** Backlog | Ready | Active | Done | Cancelled
**Origin:** YYYY-MM-DD — short context
**Linked SDD:** —
**Related commits:** —

### Context
...

### Proposed approach
1. ...
2. ...
3. ...

### Files
- `path/to/file` (Create | Modify — what changes)

### Risks
- ...
```
