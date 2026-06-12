# Changelog

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
| `20260521000004_correct_relatorio_mensal_template.sql` | Corrected `relatorio_mensal` email template HTML |
| `20260521000003_fix_report_views.sql` | UNIQUE `(report_id, email)` on `report_views` + updated RPC |
| `20260521000002_fix_relatorio_mensal_template.sql` | Replaced `relatorio_mensal` template with Comunicado Geral shell |
| `20260521000000_relatorio_mensal_template.sql` | Initial `relatorio_mensal` email template (superseded) |
| `20260522000000_brief_views.sql` | Creates `brief_views` table for tracking who viewed each brief |
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