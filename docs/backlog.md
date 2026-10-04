# Backlog — doncCX Hub

> Status: vivo. Catálogo de débitos técnicos, refactors pendentes e ideias de feature.
> Diferente de um SDD: aqui ficam itens **pré-priorização**. Itens que viram
> trabalho ativo saem do backlog e migram para um SDD dedicado em `docs/sdd/`.
> Última revisão: 2026-10-01.

## How to use

1. **New item:** copy the template at the bottom, assign the next ID (próximo livre: **`TD-016`**), add to "Open items" and to the Summary table.
2. **Ordenação:** Summary table e blocos seguem a mesma regra — prioridade H→L; no empate, `TD-###` antes de `IDEA-###`, depois ID ascendente. `Closed items` em data-desc (mais recente primeiro).
3. **Triaging:** bump Priority; mark `Status: Ready` when scope is clear and effort is estimated.
4. **Activating:** when work starts, create or link a SDD in `docs/sdd/` and set `Status: Active → docs/sdd/<name>-sdd.md`.
5. **Closing:** move the block to "Closed items" with commit hash + date, and set the Summary row to `Done`. Do not delete.
6. **Cancelling:** keep the entry in Open items, set `Status: Cancelled` with a one-line reason.

> **Revisão periódica:** a Summary table e o "Next up" são a única fonte de status — o
> `### Por status` manual foi removido por ser cópia inevitavelmente desatualizada. Rodar a
> revisão a cada trimestre ou quando um item de H mudar de estado; revalidar o TD-005
> (janela de 3 meses de `profissionais_versao`) até **2026-12-30**.

## Summary

| ID | Type | Title | Priority | Status | Linked SDD |
|---|---|---|---|---|---|
| TD-002 | Tech Debt | Desativar legacy API keys e migrar frontend para `sb_publishable_*` | H | Done | — |
| TD-005 | Tech Debt | Migrar health score de active_users para profissionais_versao | H | Backlog | — |
| TD-006 | Refactor | Tabela sync_service_log para rastreamento independente por serviço | H | Done | `docs/superpowers/specs/2026-07-27-sync-service-log-design.md` |
| IDEA-002 | Feature | Dashboard v3 (`/dashboard` para todos) + monolito → `/labs` admin-only | H | Active | `docs/sdd/labs-dashboard-sdd.md` |
| TD-001 | Tech Debt | Drop `clients.app_code` / `clients.url_donc` (backfill + drop columns) | M | Done | — |
| TD-003 | Tech Debt | Migrar RMC para dados do n8n (os_criadas, histórico) | M | Done | — |
| TD-008 | Tech Debt | Fechamento Phase 4 — remover wrappers legados em monthly-sync | M | Backlog | `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` |
| TD-009 | Refactor | Remover modal legado `ClientForm.jsx` (V2 definitivo) | M | Done | `docs/sdd/empresas-form-v2-sdd.md` |
| TD-011 | Tech Debt | Migrar `SettingsSyncStatus` de `sync_log` para `sync_service_log` | M | Ready | — |
| IDEA-001 | Idea | UI Pattern Library — Phase 2 (8 patterns restantes) | M | Ready | `docs/sdd/ui-patterns-phase2-sdd.md` |
| TD-012 | Tech Debt | Decidir entre migrations versionadas e aplicação via MCP | M | Backlog | — |
| IDEA-003 | Idea | Reajuste anual assistido por série | M | Backlog | `docs/sdd/financeiro-cockpit-sdd.md` |
| TD-013 | Bug | Cron exibido em UTC com `UTC_TO_BRT` somando 3h sobre horário já em BRT | M | Backlog | `docs/sdd/contract-series-lifecycle-sdd.md` |
| TD-014 | Refactor | Mover ações de ciclo de vida para o caminho de submit | M | Backlog | `docs/sdd/contract-series-lifecycle-sdd.md` |
| TD-015 | Tech Debt | Unificar "Suspender cobrança" (`nao_bilhetavel`) com concessão (`billing_exceptions`) | M | Done | `docs/sdd/financeiro-faturamento-sdd.md` |
| TD-004 | Tech Debt | Adicionar validação Zod no operational-report-sync | L | Backlog | — |
| TD-007 | Tech Debt | Investigar provisionamento legado do oak-donc-reports | L | Backlog | — |
| TD-010 | Refactor | Migrar estrutura-alvo de `docs/` (README em fases) | L | Backlog | — |

## Next up

- **TD-008** — gate de espera cumprido (cron `01/09`); canário `2026-09` é o próximo passo.
- **TD-005** — revisar a partir de **out/2026** (3 meses de `profissionais_versao`).
- **IDEA-002** — fases 4 (cockpits por papel) e 6 (aposentar monolito).

---

## Open items

### TD-005 — Migrar health score de `active_users` para `profissionais_versao`

**Type:** Tech Debt
**Priority:** H
**Status:** Backlog
**Revisitar:** Outubro 2026 (3 meses de dados populados em `profissionais_versao`)
**Origin:** 2026-07-26 — `profissionais_versao` JSONB substituirá `active_users` como fonte canônica; health score ainda usa o campo antigo. Cockpit de profissionais já consome `profissionais_versao`.
**Linked SDD:** —
**Related:** `docs/superpowers/specs/2026-07-26-profissionais-cockpit-design.md`, `docs/.plans/260726-1930-profissionais-cockpit/`

#### Context

O health score calcula a dimensão "Uso" usando `client_usage.active_users` (contagem pré-agregada de ativos). O `profissionais_versao` (JSONB) é a nova fonte canônica com dados por profissional. O cockpit de profissionais já filtra `WHERE ativo = true` no JSONB. O health score precisa migrar para a mesma fonte para manter consistência.

**Riscos identificados (architect + product review 2026-07-26):**
- Usar `.length` do array conta profissionais inativos também — precisa filtrar `ativo = true`
- Meses anteriores à migration (jul/2026) têm `profissionais_versao = NULL` — backfill obrigatório
- Frontend (`useHealthScore.js`, `useDonkie.jsx`) não pode transferir JSONB inteiro — precisa de coluna integer pré-computada
- 15+ arquivos leem `active_users` (dashboard, health, relatórios, Donkie, sync)

#### Proposed approach

1. **Migration SQL** — `ALTER TABLE client_usage ADD COLUMN profissionais_ativos integer`
2. **donc-api-sync** — popular `profissionais_ativos` como `COUNT WHERE ativo = true` do JSONB
3. **Backfill** — popular meses históricos a partir do `donc_snapshot.profissionais.ativos`
4. **Fallback** — `COALESCE(profissionais_ativos, active_users)` durante 3 meses de transição
5. **Migrar consumers** — `health-recalc/index.ts`, `healthScore.js`, `useHealthScore.js`, `useDonkie.jsx`
6. **Verificar** — snapshot de scores de 5 clientes antes/depois para evitar regressão

#### Files

- `supabase/migrations/` (Create — add column + backfill)
- `supabase/functions/donc-api-sync/index.ts` (Modify — popular profissionais_ativos)
- `supabase/functions/health-recalc/index.ts` (Modify — ler profissionais_ativos)
- `src/lib/healthScore.js` (Modify — idem)
- `src/hooks/useHealthScore.js` (Modify — select profissionais_ativos)
- `src/hooks/useDonkie.jsx` (Modify — idem, 2 lugares)
- `docs/modules/health-score-dashboard.md` (Modify — documentar nova coluna; engine fundido aqui em 2026-09-07)
- `docs/sdd/health-score-dashboard-sdd.md` (Modify — atualizar spec)

#### Risks

- Score de Uso pode mudar para dezenas de clientes na primeira recalc pós-migração
- CSMs priorizam carteira pelo health score — ordenação pode mudar radicalmente
- Comunicar CSMs com 1 semana de antecedência se scores mudarem >5 pts em clientes ABC-A

---

### IDEA-002 — Dashboard v3 + monolito em Labs

**Type:** Feature / Refactor
**Priority:** H
**Status:** Active → `docs/sdd/labs-dashboard-sdd.md`
**Linked SDD:** `docs/sdd/labs-dashboard-sdd.md`
**Origin:** 2026-08-29 — o SDD do "Labs Dashboard" descrevia `/labs/dashboard` como a nova dash minimalista ("Genérica", 5 blocos, sem MRR/OS) e `/dashboard` como o monolito legado. Decisão do stakeholder **inverteu**: o mock `docs/mock/meu-dia-generic-v3.html` vira a dashboard principal em `/dashboard` para os 6 papéis; o monolito (`DashboardPage.jsx`) vai para `/labs/dashboard` sob `AdminOnlyRoute`.

#### Context

A v3 evoluiu (v1→v3) de "Genérica" para uma dashboard completa que re-incorpora o layout do monolito (Pulso / Portfólio / Operacional) + HERO por papel + seções novas (YTD "Nossa força em Números", Mapa vivo). O SDD foi reescrito para refletir a arquitetura-alvo e o estado real do código.

#### Gap analysis (resumo — detalhe no SDD §1)

- `src/lib/scoring.js`, `src/components/dashboard/BrazilMap.jsx`, `src/hooks/useLabsClients.js` **já existem** (o SDD antigo mandava criar). `BrazilMap` e `useLabsClients` estão órfãos.
- Não existe agregação YTD nem média móvel de 90 dias — tudo é mês-vs-mês. Full-fidelity exige RPCs novos.
- Gotcha A3 (vazamento de MRR via `CLIENT_SELECT = *`) vira **crítico** com `/dashboard` global → masking no banco (`get_finance_summary` RPC / view).
- `useGreeting` só produz 2 linhas; a 3ª ("Dados referente a jul/26") vem do status de sincronização (`sync_log`), calculada na página. `identity.ts` não tem pools `sales`/`finance`.
- Flag `labs_dashboard` aposentada (não faz mais sentido).

#### Phases (SDD §6)

0 Foundation (**done**) · 1 Route scaffold + flag (**done, 2026-08-29**) · 2 Data foundation (**done, 2026-08-30**) · 3 v3 build + swap + ajustes de UI — **v3 = `/dashboard` para os 6 papéis, verificado em prod (done, 2026-08-30); flag `dashboard_v3` mantida como kill-switch** · **4 Cockpits por papel (roadmap) — próxima** · 5 Matriz de acesso Empresas · 6 Aposentar monolito.

#### Progresso

- **Fase 1 shipada:** `/dashboard` → `DashboardRoute` (monolito por padrão; v3 shell para admin via flag `dashboard_v3`, ligada); `/labs/dashboard` → monolito sob `AdminOnlyRoute`; `labs_dashboard` aposentada; `MeuDiaV3Page` shell (7 placeholders). Verificado em prod pelo admin.
- **2 hotfixes de auth** (bugs pré-existentes expostos pelo primeiro deploy): logout resiliente a sessão expirada (`3d1ed81`) + Web Locks do gotrue desligado (`89c022e`, deadlock a cada deploy).
- **Fase 2 shipada (2026-08-30):** 3 migrations em prod (`get_dashboard_ytd`, `get_operational_90d_avg`, `get_finance_summary` role-guarded; RLS write de `activities` p/ csm/sales); hooks `useDashboardClients` / `useDashboardYtd` (+ `useOperational90dAvg`) / `useOperationalDeltas` (+ `useOpClientHistory`); helpers de mês + `dataRefMonth` em `scoring.js`; pools `sales`/`finance` no greeting. A3 mitigado para o `/dashboard`.
- **Fase 3 — blocos + swap + ajustes de UI (2026-08-30, verificado em prod):** `MeuDiaV3Page` real (7 blocos), `ui/Drawer.jsx` compartilhado, `BrazilMap` interativo + degrade, `BlockBoundary`, `:focus-visible`/reduced-motion globais. `/dashboard` = v3 p/ os 6 papéis (`20260830000003` amplia a flag; kill-switch por banco). Analyst: carve-out + link na navbar. **Ajustes de UI (`f42b959` + RPCs `20260830000004`):** HERO refeito (foto 108px, 3 linhas, cards Clientes/Profissionais/Health), dropdown Carteira removido, Saúde/Projetos/Mapa/Operacional = toda a base p/ os 6 papéis via 3 RPCs `SECURITY DEFINER`, drill-in gated (`canDrillIn`), Projetos → `?tab=operacional&sub=projetos`.
- **Follow-up (não urgente):** limpar a flag/wrapper — deletar `DashboardRoute.jsx`, `/dashboard` → `MeuDiaV3Page` direto, `DELETE` da flag, tirar de `SettingsFeatureFlags`. ARIA do "Ver como" (Navbar). `handleSync` inline no bloco Operacional. Bug de peso do greeting-engine (L1 "Uma semana produtiva" em dia útil).
- **Polish 2026-09-07 (`14472b5`, verificado em prod):** botão "abrir Health Score" condicional (`canSeeHealth`); "ver todos" dos Projetos vira drawer local (fim do `/cockpits` em branco); mapa com drawer por UF + `?estado=` funcional; gating visual criar/editar em `/empresas`. **Matriz de acesso Empresas (fase 5, parcial):** leitura global (`20260903000001`), detalhe `overview+anexos` p/ não-admin, sales cria/edita carteira (`20260903000002`, `88da21a`). Restam fases 4 (cockpits por papel) e 6 (aposentar monolito).

#### Files

- Docs: `docs/sdd/labs-dashboard-sdd.md` (reescrito), `docs/modules/meu-dia-dashboard.md` (novo), `docs/modules/{pages,contexts,lib}.md`, `.agents/docs-index.md`, `docs/CHANGELOG.md`
- Código Fase 1: `src/App.jsx`, `src/pages/DashboardRoute.jsx` + `src/pages/MeuDiaV3Page.jsx` (novos), `src/pages/labs/LabsDashboardPage.jsx`, `src/components/layout/Navbar.jsx`, `src/components/settings/SettingsFeatureFlags.jsx`, `src/contexts/AuthContext.jsx`, `src/lib/supabaseClient.js`, `supabase/migrations/20260829000000_*.sql`
- Fases 2-3: `src/components/dashboard/v3/*`, `src/components/ui/Drawer.jsx`, hooks + migrations (ver SDD "Files to be touched")

---

### TD-008 — Fechamento Phase 4 — remover wrappers legados em monthly-sync

**Type:** Tech Debt
**Priority:** M
**Status:** Backlog
**Origin:** 2026-08-20 — `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` marcado `Done` com §4.6/§4.7 100% e Phase 4 estabilizada (canários 2026-06/07/08). Resta limpeza cosmética: `supabase/functions/monthly-sync/index.ts:41-53` mantém 4 wrappers que só delegam para `supabase/functions/_shared/freshdesk.ts`.
**Linked SDD:** `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` (Phase 4, Implementation Log)
**Related:** `supabase/functions/_shared/freshdesk.ts`, `supabase/functions/monthly-sync/index.ts`, `scripts/freshdesk-canary.js`, commits `7c4e93e`/`90b6972`/`87c59cb`

#### Context

`monthly-sync` importa canônico com alias (`fdGetCanonical`, `getGroupsMapCanonical`…) e expõe 4 wrappers idênticos (`getGroupsMap`, `fetchTicketsByCompany`, `fetchContactsByCompany`, `processTicketsToSupport`) apenas para preservar fallback legado via `isCanonicalEnabled`. Pós-estabilização, fallback não é mais necessário como código — kill switch `freshdesk_config.freshdesk_canonical_enabled` permanece como rollback de dados, não de código. `src/lib/freshdeskSync.js` é canônico próprio via `freshdesk-proxy` e não deve ser tocado (Deno vs Vite).

#### Scope

- [ ] Gate de espera — cron `01/09 00:01 UTC` (pg_cron → `monthly-sync`) sem disparo manual. **Referência vencida em 01/09/2026 — confirmar no `sync_log` antes de fechar.**
- [ ] Validar: `node scripts/freshdesk-canary.js 2026-09` (Rev.1, `source=freshdesk`, `run_id` novo, `published`), `2026-08` sem regressão, `2026-07` Rev.2 preservado, `History` mostra `01/09 success: 13 empresas · donc · health`, `sync_log` sem `failed`/`running` preso.
- [ ] Remover `supabase/functions/monthly-sync/index.ts:41-53` (4 wrappers) e trocar import para `import { getGroupsMap, fetchTicketsByCompany, fetchContactsByCompany, processTicketsToSupport, isCanonicalEnabled } from "../_shared/freshdesk.ts"` direto.
- [ ] Manter `isCanonicalEnabled` + `freshdesk_config.freshdesk_canonical_enabled` até `01/10` como kill switch de rollback (reverter commit se falhar).
- [ ] `npm run build` + `node_modules/.bin/supabase functions deploy monthly-sync` (única função alterada).
- [ ] Atualizar `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` Implementation Log com `Removal: Done` e `docs/backlog.md` → Done.

#### Non-scope

- Não alterar `src/lib/freshdeskSync.js` (duplicação intencional frontend vs Edge).
- Não remover `isCanonicalEnabled`/kill switch antes de 01/10.
- Não tocar `donc-api-sync`/`health-recalc` (fora do SDD).

#### Acceptance

- `monthly-sync` sem wrappers (`grep -n "getGroupsMapCanonical" ` retorna 0).
- `npm run build` OK, `supabase functions deploy monthly-sync` OK, canário `2026-09` OK pós-deploy.
- Rollback documentado: reverter commit + `upsert freshdesk_canonical_enabled=false` se necessário.
- SDD Implementation Log e backlog marcados Done.

#### Files

- `supabase/functions/monthly-sync/index.ts` (Modify — remover wrappers, importar direto de `_shared/freshdesk.ts`)
- `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` (Modify — log `Removal: Done`)
- `docs/backlog.md` (Modify — TD-008 → Done)

#### Risks

- Se Freshdesk mudar grupos/N3 entre 20/08 e 01/09, `getGroupsMap` pode quebrar — coberto por `withRetry` 429/5xx, mas manter kill switch até 01/10.
- Deploy esquecido após edit → usar `node_modules/.bin/supabase` (WSL) conforme `Project Gotchas`.

---

### TD-011 — Migrar `SettingsSyncStatus` de `sync_log` para `sync_service_log`

**Type:** Tech Debt
**Priority:** M
**Status:** Ready
**Parent:** TD-006 (fase 1 fechada em 2026-07-28)
**Origin:** 2026-09-26 — fase 2 do TD-006 registrada até agora apenas como prosa no `Known issues` daquele item; promovida a item próprio para ter escopo e aceite rastreáveis.
**Linked SDD:** —
**Related:** `docs/superpowers/specs/2026-07-27-sync-service-log-design.md` §Fase 2, `docs/modules/settings.md`, `docs/modules/sync.md`

#### Context

`sync_service_log` (TD-006 fase 1) é a fonte canônica por serviço, com RLS desabilitada e `GRANT SELECT TO anon, authenticated`. O cockpit de profissionais já a consome. O resto do frontend não: `src/hooks/useSyncStatus.js:9,30` ainda lê `sync_log`, que só registra o orquestrador `monthly-sync` com um timestamp único — misturando os serviços. `src/components/settings/SettingsSyncStatus.jsx` (22.5 KB, o maior consumidor) exibe esse dado agregado em `/configuracoes`.

#### Scope

- Migrar `useSyncStatus.js` de `sync_log` para `sync_service_log`, agrupando por `service_name` (`donc-api` | `freshdesk` | `health-recalc`).
- Adaptar `SettingsSyncStatus.jsx` para exibir timestamp por serviço, mantendo o layout e os cards existentes.
- Manter `sync_log` como fallback até a UI estar verificada em prod — mesma cautious approach do TD-006 fase 1 (`9722bbc` "RLS + fallback").
- Deploy atômico dos dois arquivos (lição de `a685e9f` + `2f14ef5`: `queryFn` precisa retornar `data` explicitamente, não `{data, error}`).

#### Files

- `src/hooks/useSyncStatus.js` (Modify — query `sync_service_log` por `service_name`)
- `src/components/settings/SettingsSyncStatus.jsx` (Modify — UI por serviço)
- `docs/modules/settings.md` (Modify — documentar a fonte)
- `docs/modules/sync.md` (Modify — marcar `sync_log` como legado p/ status)

#### Acceptance

- `grep -rn "from('sync_log')" src/` retorna 0 ocorrências.
- `npm run build` OK.
- `/configuracoes` exibe timestamp independente por serviço (Freshdesk manual ≠ timestamp do cron).
- Fallback para `sync_log` removido após verificação em prod.

#### Risks

- `SettingsSyncStatus.jsx` é o maior consumidor (22.5 KB) e pode ter lógica acoplada ao formato de `sync_log.summary`.
- Agrupar por `service_name` muda a forma do dado devolvido pelo hook — consumidores indiretos de `useSyncStatus` podem quebrar silenciosamente.

---

### TD-012 — Decidir entre migrations versionadas e aplicação via MCP

**Type:** Tech Debt
**Priority:** M
**Status:** Backlog
**Parent:** —
**Origin:** 2026-10-01 — o fluxo documentado (`supabase db push --include-all`) não roda neste ambiente, e o banco vem sendo criado via MCP desde sempre
**Linked SDD:** —
**Related:** `AGENTS.md` § Deploy Workflow, `docs/operations/`

#### Context

O AGENTS.md manda deployar migrations com `supabase db push --include-all`, mas o CLI instalado é o binário do Windows (`/mnt/c/Users/Carvalho/AppData/Roaming/npm`) e não tem pacote para `linux-x64` — o comando falha antes de rodar. Não testado se `npx supabase` resolve, porque o caminho que funciona é o MCP `apply_migration`.

Na prática o banco já é criado e alterado por MCP, e não por migrations versionadas. O custo apareceu em 2026-10-01: criei `20260930120000_charges_write_manager.sql` local, apliquei via MCP (que gera o próprio timestamp → `20261001201606`), e os dois divergiram. Tive que renomear o arquivo para não reaplicar no próximo push. Ainda não é destrutivo, porque a migration era `DROP POLICY IF EXISTS` + `CREATE POLICY` e roda duas vezes sem efeito — mas uma migration não-idempotente divergiria do mesmo jeito.

Uma diferença que importa: `db push` lê `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`, e o `.env.local` tem o token de Management API mas **não** a senha do banco. O MCP usa a conexão que o próprio servidor já tem. Então MCP não é só atalho, é o caminho que os segredos disponíveis suportam.

#### Proposed approach

Decidir entre:

1. **MCP como caminho único**, abandoning `supabase/migrations/` como histórico — e ajustar o AGENTS.md para dizer isso, para parar de instruir um comando que falha.
2. **Instalar o CLI Linux** e voltar a `db push`, mantendo MCP só para correções pontuais de exploração. Custa confirmar que a senha do banco entra no ambiente.
3. **Os dois, com regra explícita** — migration em arquivo para mudanças estruturais que valem histórico; MCP para ajuste pontual. Exige convenção sobre quando cada um, que é a parte que costuma ficar ambígua.

Independente da escolha: decidir se `contract_series` ganha índice único real para a recorrência (hoje `installment_group IS NULL` anula o unique — ver adendo v2.0 do SDD do cockpit), porque isso torna a idempotência do job dependente de guarda em código.

#### Files

- `AGENTS.md` (Modify — § Deploy Workflow, se for MCP como caminho único)
- `docs/operations/` (Modify — registrar o fluxo real)

#### Acceptance

- Um comando novo responde: o que eu uso para uma mudança de schema?
- `docs/` e `AGENTS.md` dizem a mesma coisa
- Não existe mais divergência entre `supabase_migrations.schema_migrations` e `supabase/migrations/`

---

---

### TD-013 — Cron exibido em UTC com `UTC_TO_BRT` somando 3h sobre horário já em BRT

**Type:** Bug
**Priority:** M
**Status:** Backlog
**Parent:** —
**Origin:** 2026-10-02 — identificado ao criar o cron do `contract-series-sync`
**Linked SDD:** `docs/sdd/contract-series-lifecycle-sdd.md`
**Related:** `src/components/settings/SettingsSyncStatus.jsx`, `manage_cron_job`

#### Context

`cron.job.schedule` guarda a expressão que o pg_cron executa, e o pg_cron roda em UTC. Em Settings, `SettingsSyncStatus` mostra essa expressão convertida com `UTC_TO_BRT` — mas o navegador já está no fuso do usuário, então a conversão soma 3h a um valor que já era BRT.

Consequência prática: o job `monthly-sync-job` roda `1 0 1 * *`, que é 00:01 UTC do dia 1 = **21:01 BRT do dia 31**. A tela diz que roda "às 00:01". Quem usa a tela para saber quando o faturamento do mês fecha lê 3 horas a mais, e a discrepancy é invisível porque nada mais mostra o horário real.

Pior: como a conversão soma em vez de subtrair, um admin que tente "corrigir" o horário digitando o valor que a tela manda digitar (00:01) grava `1 0 1 * *` no cron — ou seja, o valor errado da tela é exatamente o valor certo do cron. O bug se autoconserta na primeira tentativa de ajuste, o que esconde o problema.

`contract-series-sync-job` (`5 0 1 * *`) e `donc-api-monthly-sync` (`0 9 1 * *`) têm o mesmo problema de exibição.

#### Proposed approach

Tratar como exibição, não como agendamento: o `schedule` no banco é a fonte da verdade e já está correto.

1. Remover a conversão e mostrar a expressão como ela é, com rótulo explícito de fuso (`"00:01 UTC (21:01 BRT)"`), calculando o BRT a partir da expressão e não a partir do texto exibido.
2. Ou persistir um `timezone` no job e exibir o horário local direto, sem passar por UTC.
3. Não "consertar" os valores já gravados no cron — eles estão certos; só a leitura está errada.

Vale decidir junto com TD-011, que já mexe em `SettingsSyncStatus` e pode acabar mostrando `sync_service_log` no lugar de `cron.job`.

#### Files

- `src/components/settings/SettingsSyncStatus.jsx` (Modify — leitura do schedule)
- `src/components/settings/SyncScheduleControl.jsx` (Modify, se houver o mesmo padrão)

#### Acceptance

- A tela mostra um horário que bate com o que aparece em `cron.job_run_details`
- A conversão está documentada na tela (qual fuso é qual)
- Um teste cobre um schedule de UTC que atravessa a meia-noite BRT (é justamente o caso do dia 1)

---

### TD-014 — Mover ações de ciclo de vida para o caminho de submit

**Type:** Refactor
**Priority:** M
**Status:** Backlog
**Parent:** —
**Origin:** 2026-10-03 — a Entrega 1 da revisão da aba Contrato
**Linked SDD:** `docs/sdd/contract-series-lifecycle-sdd.md`
**Related:** `ClientFormContent.jsx`, `ContractLifecycleDialogs.jsx`

#### Context

Suspender cobrança, reativar, encerrar e reabrir gravam no banco via RPC e
**não passam pelo botão Salvar**. Toda a aba Contrato, fora essas quatro ações, é
buffer que só vira dados no submit.

Dois caminhos de escrita para os mesmos campos foi o que produziu cinco dos dez
defeitos da seção 4-bis do SDD. A Entrega 1 mitigou o dano — a edição não salva
sobrevive porque o patch é cirúrgico — mas a classe de bug continua aberta: basta
uma ação nova que esqueça de atualizar o buffer, e o próximo Salvar desfaz.

O trigger concreto do incômodo não foi técnico. Alguém suspendeu a cobrança,
depois clicou em Cancelar, e saiu achando que nada tinha acontecido. O Cancelar
cancela o formulário; a ação já estava no banco. O problema é que a tela não
esconde que a seção Status se aplica na hora.

#### Proposed approach

Ordem de preferência:

1. **Marcar a seção como "aplica-se já"** e dar a ela um feedback persistente
   (badge na seção + desfazer). Barato, resolve a confusão, não resolve a classe.
2. **Travar as ações enquanto houver edição não salva** — o diálogo oferece "Salvar
   e continuar". Exige um flag `isDirty`, que hoje não existe.
3. **Mover tudo para o submit**: encerrar vira uma intenção pendente na série e a
   RPC roda no save. Um caminho de escrita só, some a classe. Custo: encerrar passa
   a exigir Salvar, e a dialogo precisa explicar que nada foi gravado ainda.

Independente da opção escolhida: documentar no `AGENTS.md` que ações de ciclo de vida
gravam fora do submit, porque é o tipo de coisa que se esquece.

#### Files

- `src/components/clients/ClientFormContent.jsx` (Modify)
- `src/components/clients/ContractLifecycleDialogs.jsx` (Modify)
- `AGENTS.md` (Modify — seção de Surpresas)

#### Acceptance

- Nenhuma ação de ciclo de vida depende de o usuário descobrir que ela já gravou
- O caminho de escrita dos campos de billing_status tem um dono só

---

### IDEA-003 — Reajuste anual assistido por série

**Type:** Idea
**Priority:** M
**Status:** Backlog — parcialmente absorvido pelo rebuild
**Parent:** —
**Origin:** 2026-10-01 — adendo v2.0 do SDD do cockpit corrigiu a decisão #7 e definiu a direção; falta fechar o que fazer com mês já fechado
**Linked SDD:** `docs/sdd/financeiro-faturamento-sdd.md` §1.6 e §4.9 (alerta, Fase 6); `docs/sdd/financeiro-cockpit-sdd.md` (adendo 2026-10-01, v2.0)
**Related commits:** —

> **Atualização 2026-10-03 (rebuild de faturamento).** O rebuild **resolve a pergunta em aberto** e **muda o mecanismo**:
>
> - **Mês já fechado deixa de ser problema.** Fatura emitida é imutável (`financeiro-faturamento-sdd.md` §1.5). Aplicar reajuste afeta apenas competências futuras; um mês com pagamento lançado nunca é reescrito. Cai o risco nº 1 abaixo.
> - **O alerta sai na Fase 6 do rebuild** (§4.9): séries com `correction_anniversary` vencido ou a vencer em 30 dias, com ação de aplicar.
> - **O mecanismo muda:** em vez de gravar o novo valor na recorrência materializada e depender de `ensure_series_horizon` para replicar a cauda (risco nº 3 abaixo), aplicar reajuste **anexa um novo período em `series_rules`** a partir da competência de vigência. O horizonte deixa de existir como dado.
> - **O que continua em aberto:** `correction_rule = 'indice'` sem fonte de IPCA/IGP-M no projeto (risco nº 2). O valor segue digitado. Automatizar exige fonte e cache — é o que resta desta idea.
>
> Os itens 1, 2 e 3 do *Proposed approach* abaixo descrevem o modelo antigo e estão superados pelo rebuild; mantidos como histórico.

#### Context

O reajuste anual já tem a **coluna** na série (`correction_anniversary`, `correction_percent`, `correction_rule`) e nenhum **comportamento**: nada calcula, nada alerta, nada aplica. Ambos os clientes com série lançada estão com `correction_percent IS NULL`, então na prática o reajuste nunca foi exercido — a feature foi construída adiada.

O SDD v1.0 (decisão #7) dizia "sem retroatividade, Financeiro cria a renovação como nova série". O adendo v2.0 registra que a operação real é outra: **corrige-se a série existente** a partir de um vencimento. A regra de dia, validada: aplicou antes do dia de vencimento, vale naquele mês; aplicou depois, vale no próximo. Exemplo dado — aniversário 01/10/2026, vencimento dia 15, aplicado dia 8 → vale para 2026-10.

O que falta decidir antes de codar é o comportamento com **mês já fechado** (fatura lançada, pagamento registrado), porque é exatamente onde "não retroativo" deixa de ser óbvio: corrigir o valor de um mês com pagamento lançado implica mexer em histórico de adimplência.

#### Proposed approach

1. Alerta de reajuste pendente — série cuja `correction_anniversary` passou e não há ajuste aplicado para o ciclo. Onde o alerta aparece é a mesma decisão já tomada para série vencida: cockpit + lista, com ação.
2. Ação "aplicar reajuste" — o Financeiro define o valor conforme `correction_rule` (`percentual` / `indice` / `maior`) e confirma. Sem fonte de IPCA/IGP-M no projeto: o valor é digitado, não calculado.
3. Efeito — grava o novo valor na recorrência a partir do mês de vigência pelo `month_index`. Como `ensure_series_horizon` replica a última linha, o novo valor passa a ser o replicado nos meses seguintes automaticamente.
4. Definir e documentar o comportamento com pagamento já lançado no mês afetado.

#### Files

- `src/components/clients/ClientFormContent.jsx` (Modify — ação de aplicar +(rule, valor)
- `src/lib/contractRules.js` (Modify — cálculo do mês de vigência)
- `src/pages/FinanceiroCockpitPage.jsx` (Modify — alerta)
- `src/components/clients/ClientsPage.jsx` (Modify — alerta)
- `supabase/migrations/` (Modify — registro do ajuste aplicado, se auditado)

#### Risks

- Corrigir valor de mês com pagamento lançado mexe em adimplência já registrada
- `correction_rule = 'indice'` sem fonte de índice no projeto — se um dia virar cálculo automático, precisa de fonte e cache
- Reajuste aplicado corrige o mês de vigência mas a folga já materializada carrega o valor antigo — `ensure_series_horizon` precisa reprocessar a cauda

---

### IDEA-001 — UI Pattern Library — Phase 2

**Type:** Idea
**Priority:** M
**Status:** Ready
**Linked SDD:** `docs/sdd/ui-patterns-phase2-sdd.md`
**Origin:** 2026-06-14 — audit found 20 undocumented UI pattern categories after initial library (17 sections) was created

#### Context

The initial `docs/ui-patterns.md` covered 17 core patterns (table, toggle, badge, progress bar, card, etc.) plus 7 high-impact ones (button, avatar, search, filter bar, tabs, confirmation dialog, toast). An audit of the full codebase found 8 more categories in active use that have no documented standard.

#### Patterns to add

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

#### Files

- `docs/ui-patterns.md` — Add sections 25-32
- `docs/CHANGELOG.md` — Add entry

#### Acceptance

- Each section has exact Tailwind classes, source references, and usage examples
- Build passes

---

### TD-004 — Adicionar validação Zod no operational-report-sync

**Type:** Tech Debt
**Priority:** L
**Status:** Backlog
**Origin:** 2026-06-12 — schema do n8n ainda em evolução; postergado até formato estabilizar
**Linked SDD:** —
**Related commits:** —

#### Context

O payload do n8n (`data_os`, `data_produtividade`, `data_problemas`) não tem validação de schema — é `Record<string, unknown>` na edge function. Erros de formato só aparecem no frontend. O `por_tipo` ainda é normalizado ad-hoc no frontend (`reportGenerator.js:572-574`).

#### Proposed approach

1. Adicionar Zod schema em `operational-report-sync/index.ts`
2. Normalizar `por_tipo` na edge function (remover adaptação do frontend)
3. Retornar 400 com detalhes se payload não validar

#### Files

- `supabase/functions/operational-report-sync/index.ts` (Modify — adicionar validação Zod)

#### Risks

- Quebrar pipeline se n8n enviar campo novo que o schema rejeite
- Esperar formato do n8n estabilizar antes de implementar

---

### TD-007 — Investigar provisionamento legado do `oak-donc-reports`

**Type:** Tech Debt
**Priority:** L
**Status:** Backlog
**Origin:** 2026-08-16 — auditoria identificou seis registros em `clients` cujos IDs coincidem com `contrato_saas_id`. O código versionado do `operational-report-sync` não cria clientes, mas o serviço externo `oak-donc-reports` participa da coleta e pode ter criado esses dados em uma versão legada.
**Linked SDD:** —
**Related:** `client_id_reconciliation`, `docs/system/integration-points.md`

#### Context

O fluxo externo é:

```text
oak-donc-reports / n8n → coleta e parser dos CSVs → operational-report-sync → client_operational_reports
```

Os registros suspeitos foram criados em lote, sem `audit_logs`, e alguns relatórios foram gravados neles logo depois. A origem exata da criação precisa ser confirmada no código e nos logs da VPS que executa `oak-donc-reports`.

#### Scope

- Revisar o endpoint `/clients` e rotinas antigas de provisionamento.
- Verificar se `saas_id` já foi usado como `clients.id` ou como fallback de criação.
- Correlacionar logs da VPS com os horários dos seis registros.
- Confirmar se o serviço ainda possui comportamento legado em produção.
- Corrigir o serviço externo se ainda houver criação indevida.
- Documentar o contrato correto: `saas_id` identifica `client_donc_instances`, nunca `clients.id`.

#### Acceptance

- Origem dos seis registros classificada com evidência de código ou log.
- Nenhum caminho externo cria cliente a partir de contrato SaaS.
- Serviço externo trata `404`/`409` da Edge Function sem criar fallback indevido.
- Contrato de integração e procedimento de recuperação documentados.

---

### TD-010 — Migrar estrutura-alvo de `docs/`

**Type:** Refactor
**Priority:** L
**Status:** Backlog
**Origin:** 2026-09-26 — `docs/README.md:3` referencia "backlog TD-010" desde antes deste item existir; referência órfã agora legitimada.
**Linked SDD:** —
**Related:** `docs/README.md`, `docs/CHANGELOG.md`, `docs/sdd/`, `docs/superpowers/specs/`, `.agents/docs-index.md`, `AGENTS.md`

#### Context

`docs/README.md` promete uma estrutura-alvo (`product/`, `architecture/`, `operations/`, `decisions/`, índice próprio) "landing in stages", mas o layout real segue plano. Três ambiguidades concretas:

- `docs/CHANGELOG-2026-MM.md` por mês convive com `docs/CHANGELOG.md` como índice — não há regra declarada de quando o índice é regerado.
- `docs/sdd/` cumula dois papéis: SDD de entrega e ADR de decisão. O `docs-writer` pede `docs/decisions/NNN-<slug>.md` para decisão, que não existe.
- `docs/superpowers/specs/` compete com `docs/decisions/` — mesmo tipo de artefato (design pré-código), diretórios diferentes.

#### Scope

- Mapear cada doc existente → destino na estrutura-alvo.
- Consolidar `docs/superpowers/specs/` em `docs/decisions/`.
- Unificar a regra do índice de CHANGELOG.
- Fechar `docs/README.md` com a estrutura real (remover a promessa pendente).
- Alinhar `AGENTS.md` §Docs com o destino final e regenerar `.agents/docs-index.md`.

#### Acceptance

- `docs/README.md` sem promessa pendente.
- `.agents/docs-index.md` cobre o destino final (`index-updater` regenerado).
- `AGENTS.md` §Docs coerente com o layout.
- Nenhuma referência a `docs/backlog.md:NN` (número de linha) em SDDs — usar só o ID.

#### Risks

- Referências por número de linha quebram a cada edição do alvo (já há 2 quebradas hoje no SDD Freshdesk).
- `.agents/docs-index.md` é gerado — precisa regenerar junto, senão o índice aponta para arquivos movidos.
- `docs/LEGACY.md` e os CHANGELOGs históricos citam caminhos atuais; realocar exige varredura de refs.

---

## Closed items

### TD-009 — Remover modal legado `ClientForm.jsx` (V2 definitivo)

**Type:** Refactor
**Priority:** M
**Status:** Done
**Closed:** 2026-09-07 — commit `aa87554`
**Origin:** 2026-09-02 — flag `empresas_form_v2` ligada só para `admin/finance/sales`; `manager/csm` seguiam no modal legado, e os dois forms conviviam com regras divergentes (ex. validação de presença e save sem `seriesId` no legado).
**Linked SDD:** `docs/sdd/empresas-form-v2-sdd.md` (adendo 2026-09-07)
**Related commits:** `aa87554` (rotas sempre V2, `ClientFormPage` sem gate, arquivo deletado)

#### Context

`ClientsPage`/`ClientDetail` desviavam por flag (`useV2 ? navigate(...) : setShowForm(true)`). Cada mudança de regra precisava ser feita 2× — foi assim que o cliente 29 perdeu os produtos (save cruzado). Decisão: V2 sem volta.

#### What was done

- `ClientsPage` (`+ Nova Empresa`) e `ClientDetail` (`Editar`) navegam sempre para as rotas; `ClientFormPage` sem gate de flag; `ClientForm.jsx` deletado (−895 linhas líquidas no diff).

---

### TD-006 — Tabela `sync_service_log` para rastreamento independente por serviço

**Type:** Refactor
**Priority:** H
**Status:** Done
**Closed:** 2026-07-28 (ver subsection `Closed` abaixo; fase 2 — migrar `SettingsSyncStatus` — segue em aberto como `TD-011`)
**Origin:** 2026-07-27 — sync_log atual só rastreia o orquestrador `monthly-sync`, não cada serviço individual. Serviços podem ser executados manualmente em datas diferentes e precisam de timestamps independentes.
**Linked SDD:** —
**Related commits:** —

#### Context

Cada serviço (`donc-api`, `freshdesk`, `health-recalc`) pode ser disparado manualmente (via `/configuracoes` > API DONC, Freshdesk) ou via cron (`monthly-sync` orquestrador). Hoje o `sync_log` só registra o orquestrador com um timestamp único, misturando todos os serviços. Exemplo real:

```
03/07 - Freshdesk manual         → sem registro no sync_log
15/07 - DONC manual              → sem registro no sync_log
01/08 - Cron dispara tudo        → sync_log: 01/08 00:01 (todos no mesmo timestamp)
```

O cockpit de profissionais precisa exibir "última sincronização da API DONC" — não do orquestrador. O `SettingsSyncStatus` também se beneficiaria de granularidade por serviço.

#### Proposed approach

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

#### Files

- `supabase/migrations/` (Create — tabela sync_service_log)
- `supabase/functions/donc-api-sync/index.ts` (Modify — INSERT/UPDATE no sync_service_log)
- `supabase/functions/monthly-sync/index.ts` (Modify — repassar triggered_by/ref_month)
- `src/hooks/useSyncStatus.js` (Modify — query sync_service_log)
- `src/components/settings/SettingsSyncStatus.jsx` (Modify — adaptar UI)
- `src/pages/ProfissionaisCockpitPage.jsx` (Modify — exibir timestamp DONC)

#### Risks

- Refatoração pesada — 3 edge functions + frontend + migration
- `monthly-sync` precisa repassar `triggered_by` e `ref_month` corretamente para cada sub-serviço
- Migração do `SettingsSyncStatus` pode quebrar UI existente — deploy atômico necessário
- `sync_log` antigo deve ser mantido como fallback ou removido após migração completa

#### What was done (Fase 1)

1. **Migration `20260727210000`** — tabela `sync_service_log` + 3 índices + RLS
2. **donc-api-sync** — INSERT/UPDATE `sync_service_log` por instância com `triggered_by`
3. **Cockpit** — query `sync_service_log` para exibir timestamp na toolbar
4. **Migration `20260728200000`** — RLS desabilitada, `GRANT SELECT TO anon, authenticated`

#### Known issues

- ~~**❌ Timestamp não aparece no cockpit**~~ — **Resolvido em 2026-07-28** (`a685e9f` + `2f14ef5`). Causa raiz: `queryFn` retornava `{data, error}` do supabase enquanto o destructuring `const { data: lastSync }` esperava o row direto. QueryFn agora retorna `data` explicitamente, com `throw error` em caso de falha.
- ~~**❌ Over-engineering**~~ — **Rejeitado como rejected alternative (2026-07-28).** Manter `sync_service_log` abre caminho para granularidade por `instance_id` (cockpit pode futuramente mostrar "última sync por cliente") e para a fase 2 (migrar `SettingsSyncStatus` de `sync_log` para `sync_service_log` agrupando por `service_name`).
- **Fase 2** — promovida a item próprio: `TD-011`.

#### Closed

**Date:** 2026-07-28
**Commits:** `f0a5ce2` (migration + EF), `8d7ecb5` (fix .catch), `9722bbc` (RLS + fallback), `606821b` (restore CSV), `6eb4a8f` (disable RLS + grant), `7c8c90a` (staleTime=0), `0683cd4` (docs), `a685e9f` (never-synchronized fallback + drop PUBLIC policy), `2f14ef5` (queryFn return data), `ff6581c` (months from sync_service_log + drop YYYY-MM label), `c77815c` (truncate nome), `3c252e1` (widen nome to 260px)
**Linked SDD:** `docs/superpowers/specs/2026-07-27-sync-service-log-design.md`
**Linked plan:** `docs/.plans/260727-2100-sync-service-log/`

---

### TD-003 — Migrar RMC para dados do n8n (os_criadas, histórico)

**Type:** Tech Debt
**Priority:** M
**Status:** Done
**Closed:** 2026-06-12 — frontend migrado para `client_operational_reports` como fonte principal
**Origin:** 2026-06-11 — dados do n8n (`data_os.sumario.por_tipo`) têm estrutura aninhada `{ "Tipo": { total_os: N } }` diferente do esperado pelo frontend; alguns campos podem estar ausentes ou em formato inconsistente.
**Linked SDD:** —
**Related commits:** `27152ee`, `f32e1c5`, `bce71a4`

#### What was done

1. **`os_criadas` + delta** — migrado de `usage[].os_created` para `opCurrent.data_os.sumario.total_os` (n8n)
2. **`grafico_historico` (12 meses)** — migrado de `client_usage` para `client_operational_reports`; gráfico exibe meses disponíveis (cresce conforme n8n acumula)
3. **`active_users`** — mantido em `client_usage` (n8n não envia esse dado ainda)
4. **`USAGE` helper** — removido (dead code)
5. **Query `client_usage`** — reduzida para só `ref_month, active_users`

#### Files

- `src/lib/reportFields.js` (Modify — resolves de os_criadas + delta)
- `src/pages/ReportEditorPage.jsx` (Modify — query opHistory + opHistory state)
- `src/lib/reportGenerator.js` (Modify — barChartV, slideData, slideEscala, generateReportHTML)

#### Remaining

- Validação Zod do payload n8n postergada → TD-004

---

### TD-002 — Desativar legacy API keys e migrar frontend para `sb_publishable_*`

**Type:** Tech Debt
**Priority:** H
**Status:** Done
**Closed:** 2026-06-11 — legacy JWT-based API keys (anon + service_role) desativadas no Dashboard às 18:46Z; service_role JWT exposta efetivamente revogada.
**Origin:** 2026-06-11 — auditoria de segurança após exposição da service_role JWT; Edge Functions e scripts já compatíveis com `sb_secret_*` (helper `_shared/auth.ts`).
**Linked SDD:** —
**Related commits:** `5dd0968` (auth hardening + compat sb_secret), `742e1c8` (RLS freshdesk_config admin+manager).

#### Context

A service_role JWT exposta só morre de fato quando as legacy API keys são desativadas no Dashboard. Pré-requisitos entregues no `5dd0968`: funções usam `getServiceKey()` (lê `SUPABASE_SECRET_KEYS`), S2S usa `SYNC_WEBHOOK_SECRET`, scripts aceitam `SUPABASE_SECRET_KEY`.

#### What was done

1. Criadas chaves novas no Dashboard: `sb_publishable_PEDDXC13…` e secret key `default`.
2. `VITE_SUPABASE_ANON_KEY` (Vercel + `.env.local`) trocada para a publishable key; `SUPABASE_SECRET_KEY` local adicionada. supabase-js 2.101.1 aceita as chaves novas sem mudança de código.
3. Verificado server-side (Gate B): com a service_role legada fora do ambiente, `donc-api-sync` ainda responde 200 — prova de que `SUPABASE_SECRET_KEYS` está em uso. Frontend confirmado lendo via publishable; legacy anon passou a retornar 401 "Legacy API keys are disabled".
4. Legacy keys desativadas no Dashboard.

#### Notes / lessons

- Vite "assa" `VITE_SUPABASE_ANON_KEY` no **build**: trocar a env exige rebuild, e navegadores com o bundle antigo em cache (legacy anon) quebram ao desativar a legacy até um hard refresh. O "Disable JWT-based API keys" desliga anon **e** service_role juntos — não dá para separar.
- Reversível: legacy keys podem ser reativadas no Dashboard se algum cliente esquecido aparecer.

---

### TD-001 — Drop `clients.app_code` / `clients.url_donc`

**Type:** Tech Debt
**Priority:** M
**Status:** Done
**Closed:** 2026-06-09 — migration `253b590`
**Origin:** 2026-06-03 — session where the instances list started reading `url_donc` / `app_code` from `client_donc_instances`; the matching columns on `clients` were soft-deprecated instead of dropped.
**Linked SDD:** —
**Related commits:** `4a8567b` (table added in instances list), `a9c36d2` (soft deprecation in form + display), `253b590` (backfill + drop migration)

#### Context

As colunas `clients.app_code` e `clients.url_donc` ficaram órfãs: sem input no form (`ClientFormContent`, ex-`ClientForm` removido em `aa87554`), sem `InfoRow` no card navy de `ClientSubDados`, mas continuam existindo no banco e são escritas pela rota de upsert do form removido (via payload que também foi limpo — hoje o Supabase ignora chaves desconhecidas, mas o payload está semanticamente fora de sincronia com o schema).

A tabela canônica é `client_donc_instances`, que carrega esses campos por contrato SaaS desde a migration `020_donc_api_integration`.

#### Approach

1. **Backfill:** copia `url_donc` e `app_code` de `clients` para `client_donc_instances` onde a instância ainda tem NULL. Nunca sobrescreve valores existentes.
2. **Drop columnas:** `ALTER TABLE clients DROP COLUMN app_code, DROP COLUMN url_donc;`
3. **Verificação:** build limpo, frontend sem regressão — tabela de instâncias em `/empresas/:id` continua exibindo URL e App Code.

#### Files

- `supabase/migrations/20260603000000_drop_clients_appcode_urldonc.sql` — backfill + drop em um único arquivo.
- Sem mudanças de frontend (já removidas em `a9c36d2`).

#### Risks

- **Interno:** zero readers dessas colunas em `src/`, `supabase/functions/` ou `scripts/`. Edge Functions e scripts não as referenciam.
- **Externo:** BI, exports ou integrações fora deste repositório que leiam `clients.app_code` / `clients.url_donc` quebrariam. Sem visibilidade aqui — registrar no log de deploy se houver essa dependência.
- **Dados:** backfill cobre apenas primeira instância por cliente sem valor. Se uma empresa tem múltiplas instâncias e só uma delas estava populada, o backfill não sobrescreve — conservador e desejado.

---

### TD-015 — Unificar "Suspender cobrança" com concessão

**Type:** Tech Debt
**Priority:** M
**Status:** Done — 2026-10-03
**Origin:** 2026-10-03 — auditoria do §1.5 do SDD do ciclo de vida, achada ao registrar a verificação em produção
**Linked SDD:** `docs/sdd/financeiro-faturamento-sdd.md` §1.15 (resolve); `docs/sdd/contract-series-lifecycle-sdd.md` §1.5 (diagnostica)
**Related ADR:** `docs/decisions/001-rebuild-faturamento.md`
**Related:** `ContractLifecycleDialogs.jsx`, `ExcecaoModal.jsx`, `set_nao_cobrar`, `_financeiro_series_month`, `check_billing_suspended_until`

> **Resolvido pelo rebuild de faturamento (2026-10-03).** A decisão saiu junto com a premissa do módulo: **concessão e desconto passam a ser o mesmo mecanismo em dois momentos** — desconto previsto no plano entra na geração da fatura, desconto negociado é um lançamento na fatura emitida. `billing_exceptions` (0 registros, nunca operada) é extinta na migration `billing_retire`, junto com `billing_suspended_until` e o ramo `suspenso`. O diálogo "Suspender cobrança" permanece operando `nao_bilhetavel`, que continua sendo o flag permanente de faturamento — agora sem colisão de nome, porque a concessão deixa de existir como conceito separado. A decisão fica registrada em `docs/sdd/financeiro-faturamento-sdd.md` §1.12 e na tabela de decisões arquiteturais §7.

#### Context (histórico — o diagnóstico que originou a decisão)

Existem **três** mecanismos de suspensão no codebase, e dois deles têm o mesmo nome para
quem opera:

| Mecanismo | Onde | Estado | Linhas |
|---|---|---|---|
| Concessão (`billing_exceptions`) | Cockpit, `ExcecaoModal` | Tabela e modal existem, **0 concessões** | 4 funções |
| Não cobrar (`nao_bilhetavel`) | Form do cliente, diálogo "Suspender cobrança" | **7 séries** | `set_nao_cobrar` |
| Suspensão por data (`billing_suspended_until`) | — | **Morta**: coluna vazia | trigger + cockpit |

O diálogo "Suspender cobrança" — nome escolhido na Entrega 1, quando o antigo "Não cobrar"
foi rejeitado por soar accusatório — opera o **segundo** mecanismo: um flag permanente de
faturamento, sem concessão e sem data. O SDD §1.5 descrevia a suspensão como sendo o
primeiro. Era contradição de nome entre dois mecanismos reais, não implementação faltando
(registrado como defeito 13 na §4-bis).

O peso de cada um é assimétrico: 7 séries em `nao_bilhetavel` contra 0 concessões. O
caminho que ninguém usa é o que tem data; o que todo mundo usa não tem.

#### Pergunta de decisão

`nao_bilhetavel` deve virar concessão datada, `billing_exceptions` deve absorver o
diálogo do form, ou os dois ficam separados e o que muda é **só o nome**?

O que decide o custo:

- **Flag → concessão datada** quebra as 7 séries existentes e mexe em `_financeiro_series_month`,
  que hoje conta série encerrada e tem o filtro de `suspenso`. Risco de MRR histórico.
- **Absorver no form** é interface apenas, sem migração, mas mantém dois lugares para a mesma
  intenção.
- **Só o nome** é o mais barato e resolve a confusão do próximo que lê. Não resolve a
  pergunta de fundo: quem suspende por 6 meses sem querer zerar para sempre hoje não tem
  caminho.

#### Impacto colateral, se a decisão for por data

`check_billing_suspended_until` e o filtro de `suspenso` em `_financeiro_series_month`
passam a ser código necessário em vez de morto. Convém decidir isso **antes** de derrubar
as duas coisas como limpeza.

### Proposed approach

1. Decidir a pergunta de decisão acima com o Financeiro — é decisão de negócio, não técnica.
2. Se for "só o nome": renomear o diálogo para o que ele faz ("Não gerar cobrança desta
   série" ou "Marcar como não faturável") e cruzá-lo com o `ExcecaoModal` no texto do cockpit.
3. Se for concessão datada: migration primeiro, com backfill das 7 séries e `valid_from`
   aberto (`valid_to` NULL = indeterminado), depois ajustar `_financeiro_series_month`.
4. Em qualquer caminho: operar a concessão uma vez na tela antes de fechar, porque
   `ExcecaoModal` tem **zero** registros e nunca foi exercitado.

### Files

- `docs/sdd/contract-series-lifecycle-sdd.md` (Modify — §1.5 já descreve os três mecanismos)
- `src/components/clients/ContractLifecycleDialogs.jsx` (Modify — rótulo, se for só o nome)
- `supabase/migrations/` (Create — só no caminho que exigir data)

### Risks

- **Não exercitada:** `ExcecaoModal` nunca rodou com registro real. Qualquer caminho que
  dependa dele herda um bug não encontrado.
- **MRR histórico:** `_financeiro_series_month` é a função que produz o MRR de referência.
  Mexer nela exige recontar 26 séries contra o valor atual antes de aceitar o resultado.
- **Sem dono:** essa decisão é do Financeiro. Ficar no backlog sem resposta é o mesmo
  defeito 13 de novo, em outra forma.

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

Ao copiar o template, ajuste a profundidade dos headings para `###` (item) / `####` (subseção) e adicione a linha na tabela `## Summary`, respeitando a ordem H→L definida em *How to use*.
