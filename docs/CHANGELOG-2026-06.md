# Changelog


# Changelog — 2026-06

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
