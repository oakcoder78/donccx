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
| IDEA-001 | Idea | UI Pattern Library — Phase 2 (8 patterns restantes) | M | Ready | `docs/sdd/ui-patterns-phase2-sdd.md` |

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
