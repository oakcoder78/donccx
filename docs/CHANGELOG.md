# Changelog

## 2026-08-17

### Asana — Registrar tickets de atendimento como tarefas

- **New:** `asana-proxy` Edge Function — proxy para a API do Asana (`https://app.asana.com/api/1.0`) sem expor o PAT no frontend. Requer secret `ASANA_PAT` (conta bot dedicada). Rota via body `{ path, method, body, params }`, com auth JWT própria, rate limit e role check (admin/manager/analyst) — mesmo padrão do `freshdesk-proxy`.
- **New:** `src/lib/asanaConfig.js` — helpers `getAsanaConfig`/`saveAsanaConfig` (persistem em `freshdesk_config` key `asana_config`), `listAsanaWorkspaces`, `listAsanaProjects`, `listAsanaSections`, `createAsanaTask`.
- **New:** painel `SettingsAsana` em Configurações → Integrações → Asana (flag `asana`): toggle de ativação + seletores de workspace, projeto e seção (quadro).
- **New:** opção "Registrar no Asana" na tela de sucesso de criação de ticket em `/atendimento` — cria tarefa no projeto/seção configurados com `[Ticket #N]` no nome, cliente + link do Freshdesk na descrição; grava `asana_task_gid`/`asana_task_url` em `whatsapp_tickets` e exibe link "Ver no Asana".
- **DB:** colunas `asana_task_gid` e `asana_task_url` em `whatsapp_tickets` (`20260817100000_add_asana_integration.sql`).

### Empresas — Busca por nome fantasia

- **Fix:** busca em `/empresas` agora casa com `name` (razão social) **ou** `fantasy_name`, via filtro OR ilike em `buildClientsQuery` (`src/hooks/useClients.js`) — antes só buscava razão social. Cobre empresas ativas e inativas.

## 2026-08-16

### Activities — Google Meet Links + Attendees Invites

- **New:** `meet_link` column on `activities` and `onboarding_activities` (`20260816000000_add_activities_meet_link.sql`) — stores Google Meet `hangoutLink` URL for synced activities.
- **New:** `google-calendar-event` — accepts `conferenceData` (object with `createRequest` for Google Meet, or `null` to remove) and `attendees` (string[] of emails). Auto-appends `?conferenceDataVersion=1` when `conferenceData` is present and `?sendUpdates=all` when attendees are non-empty. Polls `hangoutLink` up to 10 times (1s interval) after event creation/update. Persists `meet_link` on `linkedActivity` when resolved. Response now includes `hangoutLink`.
- **New:** `google-calendar-event` DELETE — fetches existing event first to check for attendees; sends `?sendUpdates=all` on deletion when attendees exist so they receive cancellation notification. Clears both `google_event_id` and `meet_link` on `linkedActivity`.
- **New:** `ActivityModal` — opt-in "Gerar link do Google Meet" checkbox (visible when Google Calendar sync is checked). Editable attendee chips pre-filled from selected contact's `email`. Client dropdown shows `c.fantasy_name || c.name`. Guard now covers meet/attendees changes for sync detection.
- **New:** `ActivityDetailModal` — displays clickable Meet join link when `meet_link` exists. Passes `linkedActivity` on DELETE for proper `meet_link` clearing.
- **New:** `useActivities` — `useActivityMutations({ silent })` parameter to suppress individual success toasts (used for unified toast in `ActivityModal`). Contacts fetched with `email` field in select.
- **New:** `Icons.Video` — Lucide `Video` icon for Meet link display.
- **UX:** Single unified toast replaces duplicate toasts for save + Google Calendar sync.
- **UX:** `normalizeAttendees` — trims, deduplicates, and validates emails silently; omits empty arrays from API payload.

### DONC Integration — Legacy SaaS ID Reconciliation

- **Audit:** Identified six legacy `clients` rows whose IDs match external `contrato_saas_id` values. The canonical ownership is recorded in `client_id_reconciliation`; no legacy row was deleted.
- **Fix:** `operational-report-sync` now validates positive SaaS IDs and valid `YYYY-MM` periods, rejects ambiguous contract mappings with HTTP 409, and no longer uses arbitrary `.limit(1)` resolution.
- **Guard:** `client_donc_instances.contrato_saas_id` is now globally unique and must be positive, preventing the same external contract from being assigned to multiple CRM clients.
- **Validation:** Settings screens now reject non-positive or non-integer contract IDs before saving.
- **Safety:** Historical `client_operational_reports` were not copied automatically because source and canonical periods contain different data; migration remains pending review rather than silently overwriting metrics.

## 2026-08-05

### Dashboard — OS/Users Monthly Variation Cards

- **Refactor:** `DashboardPage` — operational cards (Faixa 4) rewritten with helper functions: `opAnchor` (builds comparison text like "mai 398 OS · jun 17 OS"), `OpDeltaBadge` (renders absolute delta badge with neutral state for new clients), `buildOpCountRows` (builds comparison rows sorted by absolute delta descending).
- **Fix:** Guards fixed — `curVal`/`prevVal` null or both zero now correctly skipped (before: `!curVal` blocked legitimate zero values).
- **UX:** Base-small case (`prevVal < 10`, including 0) → neutral badge "Inicio de uso" (no percentage, no color) instead of misleading large percentages.
- **UX:** Ranking by absolute delta (not percentage) — clients with largest absolute change appear first across all 3 cards (OS, Users, Health).
- **Refactor:** `opHealthAll` rows now include `prev` for consistency with OS/Users cards.

### Profissionais Cockpit — Seletor de visão na exportação

- **New:** `ProfissionaisCockpitPage` — seletor segmentado `ViewToggle` (`Ativos | Acesso no mês | Geral`) na barra "Exportar" da row expandida e no dropdown "Exportar CSV" da toolbar; estado único `exportView` (default `geral`).
- **New:** Cada visão filtra **linhas e colunas** de todos os exports (CSV Sintético, CSV Analítico e PDF, por cliente e "todos"): `Ativos` = só `ativo=true`, sem colunas Último Login/Última OS/Código OS; `Acesso no mês` = só quem logou no mês, todas as colunas; `Geral` = todos, todas as colunas.
- **New:** PDF reflete a visão — cabeçalho renderiza só o(s) card(s) correspondente(s) e o subtítulo inclui o rótulo da visão.
- **New:** Ordenação de todos os exports por `data_ultimo_login` ascendente (mais antigo primeiro; `null` por último; fallback por `nome`).
- **Chore:** Helpers `filterProfsByView()` / `sortByLoginAsc()` client-side (banco em UTC, offset `+00` → `substring(0,7)` bate com a lógica `timestamptz` das RPCs); nenhuma alteração de schema/RPC necessária.
- **Docs:** `docs/superpowers/specs/2026-07-26-profissionais-cockpit-design.md` — seção Export atualizada com o seletor de visão.

## 2026-08-04

### AI Analysis — Response Validation & Fallback

- **Fix:** `openrouter-proxy` — validates OpenRouter response structure (JSON + `choices` array with `message.content` string) before accepting as success; invalid responses trigger fallback to next model instead of forwarding `null` to frontend
- **Fix:** `openrouterService.js` — handles `null`/empty/error proxy responses with retry logic (up to 2 extra attempts across all models) instead of throwing immediately; shows specific error messages for each failure mode
- **Fix:** `openrouter-proxy` — model returning non-JSON body with HTTP 200 (e.g., `qwen/qwen3.7-flash`) is now detected and skipped automatically
- **Fix:** `openrouter-proxy` — empty `content` field (string `''`) is now treated as model failure, triggering fallback to next model instead of being forwarded as success
- **Fix:** `openrouterService.js` — added `extractJSON()` helper with multi-strategy extraction (markdown code blocks → regex brace matching → schema validation) for robust handling of non-standard AI responses
- **Fix:** `openrouterService.js` — validates ticket schema after JSON parse; missing required fields trigger retry with next model instead of returning invalid data

## 2026-07-18

### Sync Scheduling — BRT timezone + Weekly + UI Polish

- **Fix:** `SettingsSyncStatus` — `toBRT()` normalizes old UTC cron (`1 0 …`) to BRT (`1 3 …`) at display time; DB doesn't need re-save (`UTC_TO_BRT` map + `toBRT(cronExpr)`).
- **New:** Weekly schedule — "Semanas" option in "Personalizado" custom dropdown; cron saves as `1 3 */{7n} * *`.
- **New:** `SettingsSyncStatus` — BRT explanation text below Salvar button: "As execuções ocorrem às 00:01 BRT...".
- **UI:** Both buttons (Executar/Salvar) now `#59c2ed` with `minWidth:96` for same color and width; `justifyContent: center`.
- **Chore:** Removed `OLD_PRESETS` array (UTC fallback no longer needed).

## 2026-07-01

### Sync Scheduling — Fixes

- **Fix:** `manage_cron_job` RPC — `cron.unschedule()` throws "could not find valid entry for job" when job doesn't exist. Wrapped in `BEGIN...EXCEPTION` to prevent 500 on first-use scheduling (`20260701000003_fix_cron_unschedule_error.sql`).
- **Fix:** `SettingsSyncStatus` — times displayed in UTC; changed to `America/Sao_Paulo` (`formatDateTimeBR`, `nextCronDate`).
- **Fix:** `SettingsSyncStatus` — `handleScheduleOneoff` didn't refetch after scheduling; added `refetchLatest()`/`refetchHistory()`.
- **Fix:** `DoncAPIPendentes` — Modal crash: `confirmAction.count` accessed without optional chaining when `confirmAction` is null (`TypeError: Cannot read properties of null`).
- **Ops:** Edge Functions `sync-schedule` and `monthly-sync` redeployed.

## 2026-06-25

### Audit System — Phase 1 + Backlog

- **New:** Backlog de ferramentas de segurança adicionado ao SDD (Semgrep, npm audit, OWASP ZAP, trufflehog, Supabase Advisor)

### Audit System — Phase 1

- **Fix:** `audit_logs` RLS restrito — admin/manager veem todos os logs, CSM/analyst só os próprios
- **Fix:** `useDeleteProject` agora usa `useAuditLog` hook (inseria sem `user_id`/`user_name`)
- **New:** Feature flag `logs` seeded (admin/manager) — menu Auditoria agora visível
- **New:** `docs/security/SDD-AUDIT.md` — assessment completo + plano de melhorias (Fases 2-3)

### Security — Phase 2 Remediation

- **New:** `donkie-chat` — Zod input validation: messages array (role enum, content length), system string
- **New:** `send-email` — Zod input validation: template_id, recipients (email+variables), sent_by (uuid), attachments schema
- **New:** `brief-public` — Zod input validation: discriminatedUnion for all 9 actions (validate token, payload shapes per action)
- **New:** `supabase/tests/rls_policies.sql` — automated RLS policy test suite (9 tests: existence, role-based, Phase 2.5 specific, SECURITY DEFINER search_path, anon grants, blanket policy check)
- **New:** `.github/PULL_REQUEST_TEMPLATE.md` — security review checklist for new PRs
- **Fix:** Migration `20260625160000_fix_rls_role_check.sql` — RLS policies quebravam o dashboard: `auth.jwt() ->> 'role'` trocado por `public.get_user_role()` (função SECURITY DEFINER que lê `profiles.role` sem recursão); 44 policies corrigidas; removido `supabase/fix_rls_policies.sql` (script incorreto que revertia para `auth.uid() IS NOT NULL`)
- **New:** `docs/security/SECURITY_REMEDIATION_PLAN.md` — quarterly credential rotation schedule (Mar/Jun/Sep/Dec) with procedure

- **DB:** Migration `20260625200000_security_phase2_rls.sql` — harden SECURITY DEFINER functions (`check_marco_evidence`, `create_default_fases`): added `SET search_path = public`; fix permissive RLS on 6 tables (`email_logs` → admin/manager read, `ai_model_logs` → admin insert, `milestones` → service_role policy, `brief_csm_notes` → visible/own only, `freshdesk_config` → admin/manager select, `client_donc_instances` → admin/manager select)
- **Fix:** `brief-public` — path traversal em `get_attachment_urls`: valida que `path` começa com `instance.id/`
- **New:** `_shared/auth.ts` — `createRateLimiter(windowMs, maxReqs)` utility (in-memory Map)
- **Fix:** `send-email` — rate limit: 30 req/min per user (via `createRateLimiter`)
- **Fix:** `create-user` — rate limit: 5 req/min per IP (via `createRateLimiter`)
- **Fix:** `invite-user` — rate limit: 20 req/min per admin (via `createRateLimiter`)
- **Fix:** `freshdesk-proxy` — rate limit: 30 req/min per user (via `createRateLimiter`)

## 2026-06-25

### Security — Phase 1 Remediation (High)

- **DB:** Migration `20260625000000_security_phase1_rls.sql` — remove 28 blanket `"Authenticated users" FOR ALL TO authenticated USING(true) WITH CHECK(true)` policies, replace with role-based policies (admin/manager: ALL, CSM: own clients SELECT, analyst: SELECT) across `profiles`, `clients`, `onboardings`, `activities`, `activity_attachments`, `client_catalog`, `client_support`, `client_usage`, `contact_links`, `module_pricing`, `onboarding_evidencias`, `projects`, `catalog_items`, `health_config`, `health_rules`, `onboarding_activity_types`, `onboarding_capabilities`, `onboarding_config`, `onboarding_fase_types`, `contact_phones`, `contacts`, `segments`, `stages`, `project_template_activities`, `project_template_fases`, `project_templates`, `onboarding_activities`, `onboarding_fases`, `onboarding_pendencias`; also revoke `GRANT ALL TO anon` from 39 tables + alter default privileges
- **Fix:** `brief-public` — error leakage: `e.message` → `'Erro interno` (console.error kept); CORS: wildcard `*` → `createCorsHeaders(origin)` from `_shared/auth.ts`
- **Fix:** `create-user` — error leakage: `String(err)` → `'Internal server error'`
- **Fix:** `invite-user` — error leakage: `String(err)` → `'Internal server error'`
- **Fix:** `health-recalc` — error leakage: `String(err)` → `'Internal error'` / `'Internal server error'`
- **Fix:** `monthly-sync` — error leakage: 7 catch blocks sanitized (`String(err)` → `'Internal error'` / `'Internal server error'`)
- **Fix:** `operational-report-sync` — error leakage: `err.message` → `'Internal server error'`
- **Fix:** `google-calendar-callback` — open redirect: `frontendOrigin` from `state` param now validated against whitelist before redirect
- **Fix:** `google-calendar-event` — REST injection: `linkedActivity.table` restricted to `['activities', 'onboarding_activities']`

## 2026-06-24

### Security — Phase 0 Remediation (Critical)

- **Fix:** Edge function `donkie-chat` — adicionado JWT auth (`authorizeRequest`), rate limit in-memory (10 req/min), CORS restrito, erro genérico (`ac1a4a5`)
- **Fix:** Edge function `send-email` — REST injection via `sent_by` UUID validation + identity check (caller === sent_by || admin/manager) + admin SDK em vez de raw REST + erro genérico (`ac1a4a5`)
- **New:** `_shared/auth.ts` — export `createCorsHeaders()` (origens permitidas: `donccx.vercel.app`, `localhost:5173`, Vercel previews) (`ac1a4a5`)
- **Chore:** `.gitignore` — adicionado `.openclaude-profile.json` e `.openclaude/`
- **Chore:** Histórico git limpo — `.openclaude-profile.json` removido via `git filter-repo` + force push
- **Chore:** `.env.example` — adicionado `VITE_ANTHROPIC_API_KEY` e `VITE_GOOGLE_CLIENT_ID`
- **Chore:** Todas as 6 API keys rotacionadas (OpenRouter, Anthropic, Supabase Secret, Supabase Access Token, Resend, Freshdesk)
- **Chore:** Secrets atualizados no Supabase Dashboard (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `FRESHDESK_API_KEY`, `SUPABASE_SECRET_KEYS`)
- **Fix:** `useDonkie.jsx` — `searchClientsByName` quebrava com vírgula no termo de busca (ex: "Oi, quem é você"); adicionado `sanitizeSearchTerm()` (`dbe81ba`)

## 2026-06-24

### Email — Unsubscribe/View-in-Browser + Editor WYSIWYG (fixes)
- **New:** `Comunicado Geral` e `Relatorio Mensal` — footer com unsubscribe/view-in-browser (migrações 20260617000001 e 20260617000002)
- **New:** `email_view_cache` table — armazena HTML merged para view-in-browser
- **New:** `email_unsubscribes` table + `contacts.unsubscribed` column — rastreia descadastros (migração 20260617000000)
- **New:** `EmailViewPage` — rota pública `/email/view/:token` para ver e-mail no navegador (`adba3e1`)
- **New:** `EmailUnsubscribePage` — rota pública `/email/unsubscribe/:token` para descadastro (`d7c5293`)
- **Fix:** `EmailEditor` — CSS de listas visíveis (disc/decimal/circle/lower-alpha) + `@tiptap/extension-placeholder` nativo (`946768f`)
- **Fix:** `EmailEditor` — `transformPastedHTML` preserva formatação ao colar (DOMParser + whitelist de tags/styles) (`946768f`)
- **Fix:** Edge function `send-email` — gera view/unsub tokens por recipient, armazena em `email_view_cache` + `email_unsubscribes`, mergeia `unsubscribe_url`/`view_in_browser_url`/`recipient_email` (`d7c5293`)
- **Fix:** `useEmailBlastRecipients` — filtra `unsubscribed = true` dos envios em massa (`d7c5293`)
- **DB:** Migration `20260617000000_email_unsubscribe.sql` — schema + RLS
- **DB:** Migration `20260617000001_update_email_templates_footer.sql` — footer nos templates
- **DB:** Migration `20260617000002_fix_template_names_footer.sql` — correção dos nomes
- **Chore:** Instalado `@tiptap/extension-placeholder@^2.27.2`

## 2026-06-15

### Brief — Edição Inline + Preenchimento CSM
- **New:** Section title inline edit + section delete (pencil icon, Enter/blur salva, Escape cancela) (`d8bfa2c`)
- **New:** Question text + note inline edit (mesmo pattern: blur/Enter salva, Escape reverte) (`d8bfa2c`)
- **New:** Section deliverable ("Entregável") inline edit (`4f30640`)
- **New:** Pre-fill answers — upsert em `brief_responses` com `responded_by_email: 'csm'`, debounce 1.2s (`d8bfa2c`)
- **Fix:** `BriefResponsesModal` — `ReferenceError: response is not defined` → `getResponse(q.id)?.response_text` (`7d9a256`)
- **DB:** Migration `20260615000000` — policies `brief_responses_insert` / `brief_responses_update` para CSMs e admin/manager

### Settings — Column Mapping + Crash Fix
- **Fix:** `SettingsFaseTypes` — mapeia `ativo`→`active`, `nome`→`name`, `descricao`→`description` em 7 locais (empty state, Toggle, startEdit, handleAdd, handleEdit, handleToggleAtivo) (`4f13ede`)
- **Fix:** `SettingsProjectTemplates` — toggle crash (`e.stopPropagation is not a function`); `addFase` escrevia em `project_template_activities` em vez de `project_template_fases` (`4407e9c`, `42c9dc0`)

### Clients — Validação + Resiliência de Save
- **Fix:** Validação agora aceita soluções ativas (`modPricing`), não só serviços (`selectedCatalog`) (`9b56643`)
- **Fix:** Save de `client_catalog` troca `delete-all + insert` por `selective delete (só removidos) + upsert` com `onConflict`, eliminando 409/500 (`29b7d5c`)
- **Fix:** `catalogItems` deduplicado por `Map(catalog_item_id)` — evita `ON CONFLICT DO UPDATE cannot affect row a second time` (`a583810`)
- **Fix:** Error checks adicionados em `delete`/`insert`/`upsert` de `client_catalog` e `module_pricing` (`9b56643`, `df08cb8`)
- **Fix:** `saveModPricing` ganha `onError` handler com toast (`9b56643`)
- **DB:** Migration `20260615000001` — policy `client_catalog_history_insert` (trigger `trg_client_catalog_history` quebrava por RLS sem insert policy)

## 2026-06-14

### Cockpits — Project Cockpit (Novo)
- **New:** `/projetos-cockpit` — dashboard de projetos ativos por cliente com fases, status, progresso, timeline e atividades (`abd6f62`)
- **New:** `useProjectCockpit` hook — query agregada com join aninhado `fase_atual_id` dentro de `onboardings`, cálculo de progresso, role gating (`dbf403b`)
- **New:** SummaryBar (em dia/atrasado/parado), client rows com collapse/expand, sub-rows por projeto (`d8344b0`)
- **New:** ProjectTimeline, ProjectMilestonesList, PhaseCircle, back nav com ArrowLeft (`f2151dc`)
- **New:** Visão Geral de Atividades unificada com alertas + filtros + tabela padrão, toggle "Mostrar concluídas" (`2bc153b`)
- **Refactor:** Tabelas padronizadas com `bg-donc-navy` header, toggle no estilo do projeto (`704b501`)

### CS Radar — Heatmap Interativo + Tabela Padronizada
- **Refactor:** Tabela de clientes alinhada ao padrão `bg-donc-navy`, header `px-4 py-2.5`, container `rounded-lg` (`d84698d`)
- **New:** Heatmap clicável — cada célula abre painel à direita com atividades do dia (`48bdce9`)
- **New:** `dayActivities` no hook — agrupa atividades por data para drill-down (`48bdce9`)
- **Remove:** Título "Clientes" redundante acima da tabela (`48bdce9`)

### Health Dashboard — Contexto + Informações
- **Refactor:** Tabela convertida de CSS Grid inline para `<table>` padrão `bg-donc-navy`, hover via Tailwind (`d84698d`)
- **New:** Barra de legenda entre chips e tabela (bandas com thresholds dinâmicos + dimensões + Δ) (`d25d9b1`)
- **New:** Tooltips nos headers da tabela explicando cada dimensão (`d25d9b1`)
- **New:** Botão "Como funciona" no PageHeader + modal com regras, pesos e bandas vindos do banco (`d25d9b1`)
- **New:** `useHealthConfig` agora retorna também `health_dimension_weights` (`d25d9b1`)

### Dashboard — Badge de Saúde com Largura Fixa
- **Fix:** Badge "SAUDÁVEL/ATENÇÃO/RISCO" agora usa `display: block` em coluna fixa de 80px — todas as labels têm o mesmo tamanho visual, sem texto vazando na borda (`417391e`)

### Documentação — UI Pattern Library + Components
- **Refactor:** `docs/modules/ui.md` renomeado para `docs/modules/components.md`, atualizado com API de componentes
- **New:** `docs/ui-patterns.md` — biblioteca completa de padrões visuais: tabela, toggle, badge, progress bar, card, skeleton, empty state, error state, overlay, drawer, form input, band chip, keyboard nav, paleta de cores
- **New:** `docs/ui-patterns.md` — expandido com 7 padrões de alto impacto: Button (#18), Avatar (#19), Search Input (#20), Filter Bar (#21), Tab/Segmented Control (#22), Confirmation Dialog (#23), Toast/Notification (#24)
- **New:** `docs/sdd/ui-patterns-phase2-sdd.md` — SDD para fase 2 (8 padrões restantes)
- **New:** `docs/backlog.md` — IDEA-001 adicionado como `Ready`

## 2026-06-11

### Reports — AI Analysis Evolution
- **Fix:** Field keys in AI prompt (`mountUserContent`) now match `reportFields.js` — all section prompts were using stale names (`total_os` → `os_criadas`, `active_users` → `usuarios_ativos`, `execucao_min` → `tempo_execucao`, etc.), causing every value to resolve to "N/D"
- **Fix:** Added `pct_montagem` and `pct_assistencia` fields to escala registry (resolve from `data_os.sumario.por_tipo`)
- **Fix:** Object values in data dump now serialize via `JSON.stringify` instead of `String()` (was producing `[object Object]`)
- **New:** Custom instruction textarea per section (`analysisContext`) — when filled, replaces the default summary, auto-includes a field-value dump, and switches system prompt to strict mode ("analyze ONLY what was asked")
- **New:** `includeRawData` checkbox per section — when ON, appends all resolved field values (including charts/arrays) to the AI prompt
- **New:** Two system prompt variants — standard for summary-only mode, strict ("ignore unrelated metrics") when custom instructions are provided
- **UX:** KPI Extras reordered to between auto fields and callout; `mt-6 pt-4 border-t` spacing on both KPI Extras and callout blocks
- **UX:** "+ Adicionar métrica" changed from text-link to `<Button variant="primary" size="xs">` with `<Icons.Plus />` (project standard)
- **New file:** `docs/modules/report-ai-analysis.md` — full module documentation

### Security — Edge Functions Auth Hardening (service_role exposta)
- **Security fix:** Removido fallback de decode manual de JWT (`payload.role === 'service_role'` sem validação de assinatura) em `donc-api-sync`, `health-recalc`, `monthly-sync` e `operational-report-sync` — permitia forjar acesso com JWT sem assinatura válida.
- **Security fix:** Removida comparação direta `token === serviceKey` — a service_role key não circula mais como credencial de chamada (n8n/VPS, pg_cron).
- **Security fix:** `invite-user` agora valida o token via `auth.getUser` e exige `profiles.role === 'admin'` (antes só checava o prefixo `Bearer `).
- **New:** `supabase/functions/_shared/auth.ts` — `getServiceKey()` (compatível com novas chaves `sb_secret_*` via `SUPABASE_SECRET_KEYS`, fallback legado), `timingSafeEqual()`, `authorizeRequest()` (webhook secret OU usuário com role permitida).
- **New:** Auth servidor-servidor via header `x-webhook-secret` (`SYNC_WEBHOOK_SECRET`), comparação timing-safe. n8n e pg_cron não usam mais a service_role key.
- **Migration:** `20260611000100_fix_monthly_sync_cron_auth.sql` — cron `monthly-sync-job` passa a enviar `x-webhook-secret` lido do Vault (`sync_webhook_secret`); o header antigo dependia de GUC `app.service_role_key` inexistente.
- **Migration:** `20260611000200_freshdesk_config_allow_manager.sql` — políticas INSERT/UPDATE de `freshdesk_config` agora permitem `role IN ('admin', 'manager')` (antes só `admin`); alinha com o que `freshdesk-proxy` já permitia para leitura.
- **Compat:** Todas as Edge Functions e scripts locais compatíveis com `sb_secret_*` — REST/Storage/Auth chamados só com header `apikey` (sem `Authorization: Bearer <secret>`); scripts aceitam `SUPABASE_SECRET_KEY`.
- **Config:** `verify_jwt = false` nas 4 funções de sync (auth feita em código; chamadores S2S não enviam JWT).
- **Secret key rotation:** Secret key `default` (suspeita de exposição histórica) rotacionada para `donccxhub` — `getServiceKey()` atualizado; 12 funções redeployadas; `default` deletada no Dashboard. Commit `e16429f`.
- **TD-002 concluído:** Legacy JWT-based API keys (anon + service_role) desativadas no Dashboard às 18:46Z — service_role JWT exposta efetivamente revogada. Frontend usa `sb_publishable_*`; supabase-js 2.101.1 aceita sem mudança de código.

### Google Calendar — Token Expirado: Tratamento Amigável
- **Fix:** `google-calendar-event` — qualquer falha ao renovar o refresh token agora retorna `{ error, code: 'TOKEN_EXPIRED' }` com status 401, em vez de propagar um erro 500 genérico. OAuth apps em modo "Teste" expiram o refresh token após 7 dias; a solução definitiva é colocar o app GCP em "Em produção" (status: feito em 2026-06-11).
- **Lesson:** Modo "Testing" no GCP → refresh tokens com TTL de 7 dias. Modo "In production" → sem expiração (para usuários aprovados).

## 2026-06-09

### Dashboard — Drawer "Ver Todos" nos Painéis Operacionais
- **Fix:** "ver todos" no painel OS criadas agora abre drawer com lista completa de todos os clientes (não apenas top 5), ordenados por variação absoluta. Clicar em um cliente navega para `/empresas/:id`.
- **Fix:** "ver todos" nos painéis Usuários ativos e Health score — mesma correção. Antes abriam `DrawerOpContent` (gráficos do primeiro cliente) em vez da lista completa.
- **New data vars:** `opUsersAll`, `opHealthAll` — versões sem `.slice(0, 5)` dos dados de usuários ativos e health score.
- **New drawer modes:** `op-users-list`, `op-health-list` — renderizam `DrawerListContent` com navegação ao cliente.

### Database — Limpeza de Colunas Deprecadas (TD-001)
- **Migration:** Drop das colunas `app_code` e `url_donc` da tabela `clients`.
- **Backfill:** Cópia de valores legados para `client_donc_instances` onde a instância ainda tem NULL. Nunca sobrescreve valores existentes.
- **Status:** Backlog item TD-001 movido de Active → Done (frontend já limpo em `a9c36d2`, migration aplicada e verificada).

## 2026-06-01

### Email Blast — Envio em Massa
- **Feature:** Mass email sender in Settings > Comunicação > Envio em Massa — recipient selector with 3-criteria auto-selection (champion, técnico, has activity), per-client expand/collapse, contact chips with reason tags
- **Feature:** Full composer: template picker, EmailEditor with AI rewrite, attachment upload (`blast_temp/`), from-mode (csm/noreply), per-recipient merge tags via `send-email` edge function
- **New file:** `src/hooks/useEmailBlastRecipients.js` — parallel queries for active clients + activity contacts
- **New file:** `src/components/settings/SettingsEmailBlast.jsx` — two-column layout (recipient selector + composer)
- **New file:** `docs/sdd/email-blast-sdd.md` — SDD document
- **Settings:** Item "Envio em Massa" added to menu under "Comunicação" (same `email_templates` feature flag, manager-only)

## 2026-05-27

### Reports — Seções Operacionais (RMC)
- **Feature:** 4 novas seções operacionais em `client_operational_reports`: `indicadores_operacionais` (tempo execução + trânsito, delta com cor invertida), `qualidade_operacao` (taxa conclusão + ocorrências, subtitle dinâmico), `categorias_ocorrencia` (top-8 barras de motivo, subtitle com total), `desempenho_operacional` (tabela melhores/piores com badges Destaque/Atenção)
- **Feature:** Stacked bar chart de OS por tipo (Montagem/Desmontagem/Assistência) na seção Escala
- **Feature:** KPI de pontualidade com delta pp na seção Qualidade
- **Feature:** Top-3 cancelamentos na seção Categorias de Ocorrência
- **Feature:** Campo `overrideProdutosMontados` no editor da seção Escala (delta/media mantidos do dado real)
- **Refactor:** Reordenadas seções, `indicadores_operacionais` habilitado por padrão

### Donkie — Contexto de IA
- **Fix:** Ordem de rotas em `buildRouteContext()` — rota RMC checada antes do fallback genérico, seções do relatório agora são fonte primária de contexto
- **Fix:** `operationalData` adicionado às dependências e payload do `setReportExtra()` — Donkie recebe dados operacionais completos (produtividade, tempos, OS por tipo/status, pontualidade, ocorrências, cancelamentos, ranking, comparativo vs mês anterior)
- **Fix:** `openrouter-proxy` — corrigido carregamento de modelos (chave `SUPABASE_SERVICE_ROLE_KEY` faltando causava fallback para `FALLBACK_MODELS` expirados); atualizados modelos, timeout 15s→30s, coleta de erros por modelo; migration `20260527100000_ai_model_logs_insert_policy.sql`

### Notifications — Badge
- **Feature:** Badge vermelho no avatar admin agora clicável — `markAsRead()` limpa notificações, navega para Configurações > Donkie IA
- **New hook:** `useNotifications.markAsRead` — seta `read = true` em todas as notificações

### Reports — Análise com IA
- **Feature:** Botão "Gerar análise" em 6 seções do RMC (escala, qualidade_operacao, indicadores_operacionais, categorias_ocorrencia, desempenho_operacional, suporte) — chama `openrouter-proxy` com dados operacionais da seção, resultado preenche o callout
- **New file:** `src/lib/reportAiService.js` — `generateSectionAnalysis()` com retry 3x, system prompt fixo, `mountUserContent()` por tipo de seção
- **UX:** Textarea do callout ampliado (`rows={4}` → `{8}`), botão sem emoji (só ícone `Sparkles`)

### Reports — Composição das OS
- **Fix:** Gráfico de composição das OS trocado de barra horizontal empilhada para barras horizontais independentes (label | barra | valor), máximo 10 linhas (top-9 + "Outros" com soma do restante), cores por tipo

## 2026-05-22

### AI — Model Monitoring
- **Feature:** `openrouter-proxy` now logs each model attempt (success/fail + latency) to `ai_model_logs` table
- **Feature:** When all fallback models fail: notification inserted in `notifications` table + alert email sent to all admins via Resend (`noreply@donc.com.br`)
- **Feature:** Red badge with unread count on admin avatar in Navbar (polling via `useNotifications.js` every 30s)
- **Feature:** "Histórico de Falhas" section in Settings > Donkie IA — table with last 50 `ai_model_logs` entries
- **Migration:** `20260527000000_ai_model_logs.sql` — new table for per-model attempt tracking
- **Migration:** `20260527000001_notifications.sql` — new table for admin notification queue (RLS: admin select/update)
- **New hook:** `src/hooks/useNotifications.js`

### Email
- **Feature:** `.html` and `.htm` files now allowed as email attachments (added `text/html` to `ALLOWED_TYPES`, removed server-side rejection)

## 2026-05-21

### Reports — Enviar por E-mail
- **Feature:** "Enviar por E-mail" button in `ReportEditorPage` (visible only when published) + `ClientSubRelatorios` action with `<Icons.Send />`
- **Feature:** `EmailComposerModal` gains `preselectedTemplateName`, `initialSubject`, `initialBody` props — pre-fills composer with template `relatorio_mensal`
- **Feature:** Migration `relatorio_mensal` email template (Comunicado Geral shell → corrected HTML with logo, corpo, social bar, signature)
- **Fix:** Back button in `ReportEditorPage` uses `navigate(-1)` matching cockpit page convention
- **Fix:** `ReportPublicPage` removed `contact_emails` filter from `registerView()` — RPC called for all authorized viewers (fixes `.maybeSingle()` crash on duplicate emails)
- **Migration:** `20260521000003` — UNIQUE `(report_id, email)` on `report_views`, updated RPC with explicit conflict target + activity insert in BEGIN/EXCEPTION
- **Migration:** `20260521000004` — corrected `relatorio_mensal` template HTML

### Activities — Bug Fixes
- **Fix:** Attachment upload in `ActivityModal` now runs **before** Google Calendar sync block — activities with `google_event_id` could skip upload due to early `return` in `shouldSyncWithCalendar`
- **Fix:** Upload failure now shows `toast.error` with the real error from Supabase + modal stays open (was silent close)
- **Fix:** `AttachmentInput` accumulates files on multi-select (append instead of replace) + validates total ≤ 5
- **Fix:** `ActivityDetailModal` — added `key={file.id}` to attachments map (React key warning)

### Icon System
- **Fix:** `ClientSubRelatorios` — consistent action icons (`Pencil`, `Mail`, `Trash2`, `Send`) instead of text-only buttons

## 2026-05-18

### Refactoring — Fase 1 (Cleanup & Quick Wins)
- **Path Alias:** Added `@/` alias in `vite.config.js` + `jsconfig.json` — migrated 55 files from deep relative imports (`../../../../lib/icons`) to absolute (`@/lib/icons`)
- **Dead files:** Deleted empty migration `20260503032657_test_post_baseline.sql`
- **Dead files:** Deleted greeting-engine wrapper files (`identity.ts`, `temporal.ts`, `operational.ts`) — `compose.ts` now imports directly from `content/*`
- **Console.logs:** Removed 12 debug `console.log` statements from production code (`compose.ts`, `ActivityDetailModal.jsx`, `SettingsFreshdesk.jsx`, `SettingsDoncAPI.jsx`)
- **Build:** Verified clean build after all changes

## 2026-05-16

### Email Module
- **Feature:** WYSIWYG editor (`EmailEditor`) replaces textarea — TipTap v2 with Bold, Italic, Underline, H1-H3, lists, alignment, link, remove formatting toolbar
- **Feature:** ✨ Reescrever button in editor toolbar — calls `openrouter-proxy` with configurable prompt (`email_rewrite_prompt` in `freshdesk_config`)
- **Fix:** Email templates `<p>{{corpo_mensagem}}</p>` → `<div>` to avoid nested `<p>`
- **Fix:** `supabase/config.toml` — `[functions.openrouter-proxy] verify_jwt = false` (fixes error 546)
- **Dependency:** Added `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-text-align`

### Settings
- **Refactor:** `SettingsDonkie.jsx` deleted — Donkie configuration consolidated into `SettingsAI.jsx` (4 sections: Models+Debug, WhatsApp Prompt, Donkie, Email)
- **Refactor:** Menu "Donkie" + "IA" merged into single "Donkie IA" entry gated by `ai` feature flag

## 2026-05-15

### Email Module
- **Feature:** Email attachments — upload to `activity-attachments` bucket, edge downloads+base64, sends via Resend, persisted as `activity_attachments` records (visible in ActivityDetailModal, ClientSubAnexos, ClientTabActivities)
- **Refactor:** EmailComposerModal redesigned — single-screen composer with chips "Para:" input (Gmail-style), company swap icon (`RefreshCw`), preview opens optional Modal (not a required step)
- **Fix:** Domain validation — CSM sender requires `@donc.com.br`, radio button disabled + warning shown, edge function returns 400 on invalid domain
- **Fix:** Storage download URL corrected — bucket name `activity-attachments` added to download path
- **Feature:** Email button in ClientTabContatos replaces `mailto:` link — opens composer with preselected contact and company

### Brief Module
- **Feature:** Delete questionnaire — `Trash2` icon per card with response count warning, confirmation dialog, audit log entry (`action='deleted', entity_type='questionnaire'`)

### Client Usage
- **Feature:** Per-row toggle for OS type chips — `Eye`/`EyeOff` icon per month in actions column, independent expand/collapse via `Set`

## 2026-05-14

### Brief Discovery Module
- **Feature:** Header button renamed from "Brief" / "Editar Brief" to **"Questionários"** — opens `BriefPanelModal` containing `BriefPanel`
- **Feature:** `BriefPanel` — modal listing all brief instances per onboarding, supports multiple briefs per project
- **Feature:** `BriefViewsModal` — shows who viewed each brief (email, viewed_at, resolved contact name via `contact_links`)
- **Feature:** Export MD — "Exportar MD" button in `BriefResponsesModal` header downloads responses as formatted Markdown
- **Feature:** Badge on "Questionários" button shows count of unanswered client questions across all briefs for the onboarding
- **Fix:** Back button navigation from project details properly returns to onboarding cover

### Clients / Contacts
- **Feature:** ClientTabContatos now shows badges and action buttons per contact (edit, delete, send email)
- **Feature:** Contact list uses CSS grid with 3 fixed columns, vertical action alignment with self-center
- **Feature:** Contact drawer enlarged for better UX

### Email Module
- **Feature:** `EmailComposerModal` integrated into ContactPanel — "Enviar e-mail" button per contact in ClientTabContatos

### Settings
- **Fix:** Manager role now allowed to edit settings components (previously admin-only)

### Google Calendar Sync
- **Fix:** `useGoogleCalendarStatus` uses `.maybeSingle()` to avoid crash when no `user_google_configs` row exists (PGRST116 error handled gracefully — returns `connected: false`)
- **Fix:** `ActivityModal` only syncs on relevant field changes — `shouldSyncWithCalendar()` checks `type === 'reuniao'` + changed `title | activity_date | activity_time`; guard `if (!isGoogleConnected) return`
- **Fix:** `ActivityDetailModal` `handleSyncToGoogleCalendar` guarded with `if (!isConnected) return`
- **Fix:** `isExpired` removed from hook return (unused)
- **Fix:** `Icons.Calendar` replaces direct lucide-react import in `ActivityDetailModal`

### Projects
- **Refactor:** Simplified `ProjectModal` — removed redundant fields for onboarding/expansao projects (kickoff_date, start_date, end_date are now managed via onboarding detail page; removed `FASE_LABELS` import and `useOnboardingConfig` dependency)
- **Fix:** Restored missing mutation hooks in `ProjectModal` — `useCreateOnboardingFlow`, `useUpdateOnboardingFlow`, `useCreateInternalProject`, `useUpdateProject` were missing after refactor

## 2026-05-13

*(See `docs/modules/brief.md` and `docs/modules/email.md` for full module history)*

## Migration Index

| Migration | Description |
|-----------|-------------|
| `20260615000001_fix_client_catalog_history_rls.sql` | Adds `client_catalog_history_insert` policy — trigger quebrava por RLS ao salvar client_catalog |
| `20260615000000_brief_responses_insert_policy.sql` | Adds `brief_responses_insert` / `brief_responses_update` policies |
| `20260614000000_projects_cockpit_flag.sql` | Adds `projects_cockpit` feature flag |
| `20260522000000_brief_views.sql` | Creates `brief_views` table for tracking who viewed each brief |
| `20260521000004_correct_relatorio_mensal_template.sql` | Corrected `relatorio_mensal` email template HTML |
| `20260521000003_fix_report_views.sql` | UNIQUE `(report_id, email)` on `report_views` + updated RPC |
| `20260521000002_fix_relatorio_mensal_template.sql` | Replaced `relatorio_mensal` template with Comunicado Geral shell |
| `20260521000000_relatorio_mensal_template.sql` | Initial `relatorio_mensal` email template (superseded) |
| `20260521000000_brief_csm_notes_allow_reply_to_client_questions.sql` | Broadens RLS to allow CSM reply on client questions |
| `20260520000000_brief_csm_notes_client_questions.sql` | Adds `origin`, `client_email`, `client_name`, `csm_reply`, `replied_at`, `replied_by` to `brief_csm_notes` |
| `20260519000000_brief_csm_notes_question_id.sql` | Adds `question_id` column to `brief_csm_notes` for per-question notes |
| `20260518000000_brief_csm_notes.sql` | Creates `brief_csm_notes` table for CSM internal notes |
| `20260517000000_fix_brief_attachments_schema.sql` | `file_type` + `uploaded_by` columns on `brief_attachments` |
| `20260516000000_fix_email_module.sql` | Adds `from_mode` column to `email_logs` (`csm` or `noreply`) |
| `20260515000000_add_brief_templates_flag.sql` | Adds `is_active` flag to `brief_templates` |
| `20260514000000_brief_fix_onboarding_fk.sql` | Renames `brief_instances.fase_id` to `onboarding_id` + adds FK |
| `20260513000000_project_brief.sql` | Creates brief module tables and storage bucket `project-briefs` |
| `20260512120000_user_google_configs.sql` | Creates `user_google_configs` table for Google Calendar OAuth tokens |
| `20260512000000_add_email_templates_feature_flag.sql` | Adds `email_templates` feature flag (enabled for admin/manager) |
| `20260511120000_fix_email_template_signature.sql` | Resizes signature columns to 60%/20%/20%; fixes font sizes |
| `20260511000000_email_module.sql` | Creates `email_templates` and `email_logs` tables; adds `cargo` to profiles; seeds templates |
| `20260509000000_add_allows_attachments.sql` | Adds `allows_attachments` column to `onboarding_fase_types` and `onboarding_fases`; updates `create_default_fases` function |
| `20260508120000_trigger_situacao_geral_on_fases.sql` | Creates trigger to recalculate `situacao_geral` on fase status/planned_end changes |
| `20260508000000_profiles_birth_date.sql` | Adds `birth_date` column to `profiles` table |
| `20260506000101_add_monthly_sync_cron.sql` | Adds monthly sync cron job |
| `20260505115123_add_health_snapshot_column.sql` | Adds `health_snapshot` column to `client_usage` table |
