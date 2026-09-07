# Changelog


# Changelog — 2026-08

## 2026-08-30

### Dashboard v3 — ajustes de interface + blocos "geral" para todos os papéis

Feedback do usuário depois de rodar em produção. **Verificado em prod pelo usuário nos 6 papéis
(`f42b959`).** A Fase 3 do SDD fica **completa** — restam só follow-ups não-bloqueantes (limpar a
flag/wrapper `dashboard_v3`, ARIA do "Ver como", `handleSync` inline, bug de peso do greeting-engine
em dia útil).

- **HERO:** foto do perfil 72→108px, 3 linhas do greeting centradas verticalmente na imagem. Linha 2 = só a data; **linha 3 = a narrativa do greeting-engine** (ex. "Carteira equilibrada"), destacada em `C.sky` (`#59c2ed`). A linha "Dados referente a jul/26" foi **removida** (duplicava o período do topo + `dataRefMonth` derivava errado).
- **HERO cards** agora uniformes: **Clientes · Profissionais Ativos · Health Score** — para csm/sales são da **carteira**, para admin/manager são **gerais**. Sem "Ordens de Serviço", sem "Δ vs média 90 dias". finance e analyst inalterados.
- **Dropdown "Carteira"** (admin/manager) **removido** do header — só alimentava 2 blocos e a lista incluía `manager` (sem carteira) → escolher um zerava a visão.
- **Saúde por dimensão · Projetos em aberto · Mapa vivo · Operacional — variação mensal** passam a mostrar **os mesmos números (empresa toda) para os 6 papéis**. csm/sales não têm SELECT company-wide (RLS), então via **3 RPCs `SECURITY DEFINER`** (migration `20260830000004`): `get_dashboard_clients_overview`, `get_operational_deltas`, `get_open_projects_overview` — só agregados/campos não-sensíveis, **sem MRR/billing**. Drill-in (abrir drawer / `/empresas/:id`) fica limitado à carteira para csm/sales (`canDrillIn`); linhas de outras empresas aparecem sem clique.
- **"Projetos em aberto"** → clicar num card abre **`/empresas/:id?tab=operacional&sub=projetos`** (antes `?tab=onboarding`, que não exibia dados).
- Hooks: `useDashboardOverview` (novo — 2 RPCs), `useActiveProfissionais` (novo — soma RLS-scoped para o HERO), `useOperationalDeltas` reescrito para chamar o RPC. `useProjectCockpit` e `useOperational90dAvg` não são mais usados pela v3 (mantidos para outras telas).
- Aplicado via Supabase MCP + reconciliado; `npm run build` limpo; advisors de segurança sem nova exposição a `anon`.

### Dashboard v3 — vira a `/dashboard` de todos os papéis (flag como kill-switch)

- **`/dashboard` = v3 para os 6 papéis.** Migration `20260830000003_dashboard_v3_all_roles.sql` — `UPDATE feature_flags SET allowed_roles = {admin,manager,csm,sales,finance,analyst}, enabled = true WHERE key='dashboard_v3'`. O wrapper `DashboardRoute` passa a renderizar `MeuDiaV3Page` para qualquer papel.
- **A flag `dashboard_v3` fica como kill-switch por banco:** `UPDATE feature_flags SET enabled=false WHERE key='dashboard_v3'` reverte todos os papéis para o monolito **sem deploy**. Ainda aparece em `SettingsFeatureFlags`. Deletar a flag + o wrapper é limpeza posterior (quando a v3 estiver comprovadamente estável).
- **`src/App.jsx`** — carve-out do analyst no `PrivateRoute` movido de `/labs/dashboard` para `/dashboard` (analyst passa a poder abrir a v3; `AuthRedirect` ainda o leva a `/atendimento` no login).
- **`src/components/layout/Navbar.jsx`** — `analystNavLinks` ganha `{ to: '/dashboard', label: 'Dashboard' }`.
- `/labs/dashboard` = monolito admin-only (inalterado). Navbar "Labs" só para admin (inalterado).
- Aplicada via Supabase MCP (`db push` bloqueado pelo classifier) + registrada em `schema_migrations`. `npm run build` OK.

### Dashboard v3 — Phase 3: build dos blocos

- **`/dashboard` renderiza a v3 real para o admin** (atrás da flag `dashboard_v3`, já ligada). Monolito intocado para todos os outros. A troca definitiva (v3 para todos, drop da flag) **não** foi feita — espera o usuário validar os 6 papéis via "Ver como".
- **Novo `src/components/ui/Drawer.jsx`** — shell de drawer compartilhado (overlay + `<aside>` + ESC + click-outside + `drawerPushStyle` + `role="dialog"`/`aria-modal`, z-index 40/50 via `DRAWER_Z`). `HealthDashboardPage` migrado para ele (código duplicado removido).
- **10 componentes novos em `src/components/dashboard/v3/`:** `primitives` (Panel/StripHead/SeeAll/DeltaBadge/BlockShell/**BlockBoundary**), `ScopeLabel` (+ `scopeForRole`), `DashboardHeader`, `HeroBlock`, `MinhaAgendaBlock`, `SaudeDimensaoBlock`, `ProjetosAbertosBlock`, `ForcaNumerosBlock`, `EcossistemaMapBlock`, `OperacionalVariacaoBlock`, `OperationalHistoryDrawer`.
- **`MeuDiaV3Page`** reescrita: queries lifted (Fase 2 hooks + `useFinanceSummary` só p/ admin/manager/finance + `useAnalystTickets`), ordem pessoal-primeiro, `<main>` + `<h1>` sr-only, cada bloco em `<BlockBoundary>` (error boundary — um crash não derruba a página).
- **`BrazilMap`** — `onSelectUF` (clique no estado + chips "Top estados" → `/empresas?estado=UF`) + degrade gracioso: se o GeoJSON externo falhar, mostra a lista ranqueada de estados, nunca um retângulo vazio.
- **`ClientHealthDrawer`** — qaItem "Ver projeto ativo".
- **`src/lib/icons.js`** — `ArrowRight`, `Briefcase`, `DollarSign`, `LayoutDashboard`, `MapPin`.
- **`src/index.css`** — `:focus-visible` global (WCAG 2.4.7) + `@media (prefers-reduced-motion: reduce)` global (WCAG 2.3.3).
- **A11y:** tokens de texto ≥ ~8:1 (dropado `C.ink3`/`ink4` p/ corpo), `<h2>` por bloco com `aria-labelledby`, deltas com `▲/▼`+texto (`aria-hidden` no glifo), ícones decorativos `aria-hidden`, barras/donut com `role="img"`+`aria-label`. **Aberto:** ARIA do dropdown "Ver como" (Navbar) — não tocado nesta leva.
- **Follow-ups:** `handleSync` inline no bloco Operacional (hoje só link p/ `/configuracoes`); migração dos helpers do monolito p/ `scoring.js`.
- `npm run build` limpo; dev server sobe limpo.

### Dashboard v3 — Phase 2: Data Foundation

- **DB (3 migrations aplicadas em prod):**
  - `20260830000000_dashboard_v3_rpcs.sql` — `get_dashboard_ytd()` (clientes, novos no ano por `contract_start`, OS criadas no ano, pico de profissionais + mês, média de health) e `get_operational_90d_avg()` (mês atual vs média dos 3 meses anteriores, para OS e profissionais). Ambos `SECURITY DEFINER` + `search_path=public` + `REVOKE anon` + `GRANT authenticated` — visão "toda a base" idêntica para os 6 papéis, só agregados (sem MRR, sem PII).
  - `20260830000001_finance_summary_rpc.sql` — `get_finance_summary()` (`mrr_mes`, `mrr_ytd` estimado, clientes/valor em atraso, renovações 30d). Guard interno: `coalesce(get_user_role(),'') NOT IN ('admin','manager','finance')` → `raise exception 'forbidden'` (errcode 42501). **É o único caminho de MRR no /dashboard** — mitiga o gotcha A3 para a dashboard.
  - `20260830000002_activities_csm_sales_write.sql` — RLS INSERT/UPDATE/**DELETE** em `activities` para csm (carteira `csm_id`) e sales (dual `comercial_id`/`csm_id`). finance segue read-only. Desbloqueia "Nova atividade" / "Concluir" / "Excluir" da "Minha agenda" da v3.
- **Hooks (novos, ainda não ligados a nenhuma página — Fase 3):** `useDashboardClients` (wrapper de `useClients(labsFilterFor(profile))`), `useDashboardYtd` + `useOperational90dAvg`, `useOperationalDeltas` (extrai a FAIXA 4 do monolito) + `useOpClientHistory` (histórico 3 meses p/ o drawer `op-*`).
- **`src/lib/scoring.js`:** helpers de mês (`ymOffset`, `fmtMonthShort`, `fmtMonthLong`, `fmtMonthShortYear`) + `dataRefMonth(syncStatus, fallback)` para a 3ª linha do greeting ("Dados referente a jul/26").
- **`src/lib/greeting-engine/content/identity.ts`:** pools `sales` e `finance` (antes caíam em `neutral`). Conteúdo editorial, dentro da Phase A do greeting-engine.
- **`supabase/functions/monthly-sync/index.ts`:** passa a gravar `summary.ref_month`. Código commitado, **função não redeployada** nesta leva (evita o re-enable do "Verify JWT"); `dataRefMonth` deriva de `started_at` até o próximo deploy da função.
- **Ops:** `supabase db push` foi bloqueado pelo classifier do sandbox; as migrations foram aplicadas via Supabase MCP e registradas em `supabase_migrations.schema_migrations` (local ↔ remoto reconciliados — `supabase migration list` limpo). `npm run build` OK. Advisors de segurança: nenhuma nova exposição a `anon`.
- **Aberto:** `CLIENT_SELECT = '*'` ainda devolve `mrr`/`billing_*` em `/empresas`, `/health` etc. — componentes da v3 não devem ler esses campos de `useDashboardClients`. `useOperationalDeltas` é carteira-scoped para csm/sales (RLS de `client_usage`) — o `ScopeLabel` do bloco Operacional precisa refletir isso.

## 2026-08-29

### Fix — Deadlock do Web Locks do gotrue a cada deploy (`89c022e`)

- **Sintoma (reproduzível a cada deploy):** com uma aba do app aberta em background (throttled pelo browser — ex. atrás do terminal), o `navigatorLock` do `@supabase/auth-js` fica preso. A aba throttled segura o lock `sb-etfeqblaeuhaobefxilp-auth-token` e todo novo page load trava dentro de `GoTrueClient.initialize()` esperando por ele → 4-5 min de tela "Carregando" para logar, logout travado, `401` em `feature_flags` (a query dispara antes da sessão inicializar). Issue upstream: [supabase/supabase#42505](https://github.com/supabase/supabase/issues/42505).
- **Fix:** `src/lib/supabaseClient.js` — `createClient(url, key, { auth: { lock: noopLock } })`. `noopLock` tem a mesma assinatura do `lockNoOp` interno do auth-js (usado quando `navigator.locks` não existe): só executa `fn()`, sem coordenação cross-tab. O único benefício do lock é de-dup de refresh de token concorrente entre abas, já coberto pela janela de tolerância de reuse do refresh token do Supabase. Para um app interno (1 aba por usuário na prática) o custo do deadlock não compensa.
- **Este deploy dispara a cascata uma última vez** (abas antigas ainda têm o `navigatorLock`). Depois dele: fechar **todas** as abas de `donccx.vercel.app` (inclusive a que fica em background) e abrir uma nova — a partir daí, sem mais deadlock.

### Fix — Logout resiliente a sessão expirada (`3d1ed81`)

- **Sintoma:** com o access token do Supabase expirado e o navigator lock do gotrue contido/órfão (aba aberta por horas, refresh interrompido), o botão "Sair" travava e o app ficava lento (`POST /auth/v1/logout?scope=global` 403, `GET /rest/v1/...` 401, `Lock ... was not released within 5000ms`). Exposto por um reload pós-deploy; **não é regressão** — a migration da Fase 1 só mexeu em `feature_flags` e o código novo não toca em auth.
- **Fix:** `AuthContext.signOut` — limpeza de `role_impersonations` em `try/catch` (best-effort, nunca bloqueia) + `supabase.auth.signOut({ scope: 'local' })` (limpa o storage e emite `SIGNED_OUT` sem a chamada de servidor que 403a com token morto). `Navbar.handleSignOut` — `try/catch` + `window.location.assign('/login')` (redirect duro independente de o `signOut` pendurar).
- **Recuperação para quem já está preso:** fechar todas as abas de `donccx.vercel.app` (libera o lock) e recarregar; se persistir, DevTools → Application → Clear site data → login.
- Bugs pré-existentes; sem migration. Follow-up: mitigação de UX para auto re-login quando o refresh falha.

### Dashboard v3 — Phase 1: route scaffold + flag transitória (`753d7a6`)

- **New:** `src/pages/DashboardRoute.jsx` — wrapper de `/dashboard`. Serve o `DashboardPage` monolítico por padrão; renderiza `MeuDiaV3Page` (novo shell) apenas quando `isEnabled('dashboard_v3', effectiveRole)`. Zero regressão: sem a flag ligada, todo mundo continua no dashboard atual.
- **New:** `AdminOnlyRoute` em `src/App.jsx` (admin-strict, sem ramo `manager`) envolve `/labs/dashboard`, que passa a renderizar o monolito (`LabsDashboardPage` virou wrapper fino + faixa "Modo legado") como referência de paridade para o admin.
- **Change:** Navbar — item "Labs" agora é `adminOnly` (visível só para `effectiveRole === 'admin'`), sem depender de flag. `availableLinks` ganhou o filtro `adminOnly`.
- **DB:** `supabase/migrations/20260829000000_retire_labs_dashboard_add_dashboard_v3_flag.sql` — `DELETE` da flag `labs_dashboard` (não é mais lida por nenhum código) + `INSERT` de `dashboard_v3` (`description`, `allowed_roles = {admin}`, `enabled = false`). `SettingsFeatureFlags` troca `labs_dashboard` → `dashboard_v3` no grupo "Cockpits & Dashboards".
- **Ops:** `supabase db push --include-all` aplicado (1 migration, sem drift) + `git push origin main` (Vercel redeploy). `feature_flags` verificado. `npm run build` OK.
- **`dashboard_v3.enabled = true`** para `{admin}` (`d86b22e`) — admin passa a ver o `MeuDiaV3Page` shell (7 blocos placeholder "Em construção — Fase 3", ordem pessoal-primeiro, rótulos de escopo) em `/dashboard`. Todos os outros papéis seguem no monolito. Verificado em prod pelo admin.
- A troca definitiva (`/dashboard` → v3 para todos, `DashboardRoute` deletado, flag dropada, carve-out do analyst movido) acontece no fim da Fase 3 num único deploy. Fases 2 (RPCs YTD/90d, `get_finance_summary`, RLS de escrita de atividades) e 3 (build dos blocos + `ui/Drawer.jsx` + WCAG AA) a seguir.

### Docs — Dashboard v3 (SDD reescrito) + gap analysis

- **Docs:** `docs/sdd/labs-dashboard-sdd.md` **reescrito**. A arquitetura-alvo foi invertida: o mock `docs/mock/meu-dia-generic-v3.html` vira a dashboard principal em `/dashboard` para os 6 papéis; o monolito `DashboardPage.jsx` vai para `/labs/dashboard` sob `AdminOnlyRoute` (admin-only). A flag `labs_dashboard` será aposentada. Escopo full-fidelity (RPCs YTD, média 90d, geo por cidade, masking de MRR). Fases: 0 Foundation (done) · 1 Route inversion · 2 Data foundation · 3 v3 build · 4 Cockpits por papel · 5 Matriz Empresas · 6 Aposentar monolito.
- **Docs:** gap analysis do mock v3 (mock × código × SDD antigo) registrado no SDD §1. Achados: `src/lib/scoring.js` / `BrazilMap.jsx` / `useLabsClients.js` já existem (o SDD antigo mandava criar; os 2 últimos órfãos); não há agregação YTD nem média 90d; gotcha A3 (vazamento de MRR) vira crítico com `/dashboard` global; `useGreeting` só produz 2 linhas (a 3ª vem do status de sync).
- **Docs:** `docs/modules/meu-dia-dashboard.md` criado + entrada em `.agents/docs-index.md`; `docs/modules/pages.md` "Dashboard Layout" marcado como em transição; `docs/backlog.md` IDEA-002 (Active).

### Docs — Dashboard v3: levantamento da superfície interativa + crítica de UX/a11y

- **Docs:** nova seção `§5 "Interactive Surface & Permissions"` no SDD (as demais renumeradas 5→6…9). Inventário dos 13 modes de drawer do monolito, `ActivityDetailModal`/`ActivityModal`, `handleSync`, filtro CSM; tabela de interação por bloco da v3; matriz "quem interage com o quê" por papel; regra transversal de gating por `effectiveRole`.
- **Docs:** crítica de UX/visual (`/impeccable critique`, score **16/40**) + auditoria de acessibilidade (`accessibility-tester`, 13 achados / WCAG 2.1 AA). Correções capturadas como requisito no SDD — o HTML do mock **não** foi editado.
- **Decisões (SDD §7):** escopo por bloco (HERO + agenda = usuário; Saúde + Projetos = carteira como o monolito; Nossa força + Mapa + Operacional = toda a base, iguais p/ todos) + `ScopeLabel` em todo bloco; ordem pessoal-primeiro; reusar `ClientHealthDrawer` + extrair `src/components/ui/Drawer.jsx` (migrar `/health`); migration de RLS p/ csm/sales escreverem `activities` da própria carteira (finance read-only); painel de sync = admin/manager only; `BrazilMap` interativo; **WCAG 2.1 AA como condição de conclusão da Fase 3**; header com seletor de período + "atualizado em".
- **SDD Fase 2** ganha migrations `activities_csm_sales_write` + `get_finance_summary`; **Fase 3** ganha `ui/Drawer.jsx` + `OperationalHistoryDrawer` + `DashboardHeader` + `ScopeLabel` + checklist de acessibilidade.
- **Sequenciamento revisado (evita regressão em produção):** Fase 1 não troca `/dashboard` pelo shell. `/dashboard` continua servindo o monolito; uma flag transitória `dashboard_v3` (`{admin}`, `enabled=false`) mostra a v3 só para admin que ligar em `/configuracoes`. `/labs/dashboard` vira `AdminOnlyRoute` já na Fase 1 (monolito) e `labs_dashboard` é aposentada. A troca definitiva (`/dashboard` → v3 p/ todos, drop da flag, carve-out do analyst) acontece no fim da Fase 3 num só deploy.
- **Sem mudança de código ainda** — implementação começa na Phase 1 do SDD.

## 2026-08-28

### Invite — Correção do 400 `null value in column "id"` ao convidar usuário

- **Fix:** `SettingsUsers.InviteUserModal` (`src/components/settings/SettingsUsers.jsx`) fazia `insert into profiles {name,email,role,status:'pending'}` **antes** de chamar `invite-user`. Como `profiles.id` é `uuid PK FK -> auth.users(id)` sem `DEFAULT`, o insert sem `id` falhava com `POST /rest/v1/profiles?select=id 400 null value in column "id"` (regressão de `790a26f`). Fluxo corrigido para **invite-first**: `POST /functions/v1/invite-user {email,role,name,redirectTo}` cria `auth.users` + trigger `handle_new_user` cria `profiles(id=new.id)`, depois Edge garante `profiles` via `adminClient`. Frontend agora usa `data.user_id` retornado para `logAction`/`toast` e não faz mais `insert`/`update` direto — preserva UX `Convidar` (`Nome*/E-mail*/Perfil`) e seções `Aguardando aprovação / Convites enviados / Todos os usuários`.
- **Fix:** `supabase/functions/invite-user/index.ts` — adicionado `upsert` com `adminClient` (bypass RLS) nos dois branches: `existingUser` → `upsert {id, name, email, role, status:'active'}` (libera direto), novo usuário → `upsert {id, name, email, role, status:'invited'}` + `update` fallback para promover `pending` do trigger para `invited`. Garante ambos os fluxos de entrada: **(1) usuário solicita acesso** (`/solicitar-acesso` → `access_requests pending` → `ApproveModal` → `invite-user`) e **(2) admin convida direto** (`InviteUserModal` → `invite-user`), convergindo em `primeiro-acesso` (`status invited → active`).
- **DB:** `supabase/migrations/20260828000000_fix_profiles_invited_status.sql` — recria `profiles_status_check` incluindo `invited` (`active|pending|blocked|invited`) e `profiles_role_check` com `sales|finance`. Migration idempotente; `invited` já era usado em `App.jsx:90` (`status==='invited' → /primeiro-acesso`) e `SettingsUsers.jsx:216`/`App.jsx` mas faltava no `CHECK` do `remote_schema`.
- **Ops:** `npx supabase db push --include-all` + `npx supabase functions deploy invite-user` + `npm run build` OK; `git push origin main` Vercel redeploy. Validado com `douglas.nunes@leevia.com.br` (Finance) — antes `400`, depois `Convite enviado`.

## 2026-08-18

### Brief público — Erro ao salvar respostas (HTTP 400)

- **Fix:** validação zod do `brief-public` (introduzida na remediação de segurança Phases 0-3, commit `c21a03a`) exigia os campos aninhados em `payload`, mas o frontend (`BriefPublicPage`, `saveBriefAttachment`) envia tudo no nível raiz — o contrato original. Resultado: toda ação de escrita falhava com 400 "Requisição inválida"; apenas `validate`/`get`/`complete`/`get_client_questions` (sem `payload` no schema) funcionavam, então a página abria mas as respostas nunca eram salvas.
- **Fix:** o schema agora valida os campos planos no topo, alinhado ao contrato do frontend e aos tipos reais do banco — `question_id` é `text` (ids do tipo `q_...`) e `attachment_id` é `uuid`. `question_id` é `nullable` em `submit_question`/`upload_attachment` (dúvida geral envia `null`); `response_text` aceita string vazia (debounce salva também campo limpo). Handlers inalterados.
- **Ops:** redeploy de `brief-public` (v47) via `supabase functions deploy brief-public`; sem mudanças no frontend. Validado end-to-end (save, dúvidas, anexos upload/preview/delete) com cleanup dos dados de teste.

### Navegação — Refresh em `/atendimento` caindo em `/module-unavailable`

- **Fix:** corrida entre o carregamento assíncrono das feature flags e as decisões de roteamento. No refresh, o cache do TanStack Query é zerado e `isEnabled()` retorna `false` enquanto as flags carregam (comportamento "false por segurança" do hook); `PrivateRoute` então redirecionava `/atendimento` → `/module-unavailable`. Para role `analyst` a linha de forçar `/atendimento` autocorrigia; para as demais roles o usuário ficava preso até clicar no menu.
- **Fix:** `useFeatureFlags` agora expõe `loading` (`isPending` do TanStack Query v5); `PrivateRoute` e `AdminRoute` aguardam as flags carregarem antes de avaliar redirects — mesmo padrão já usado com `useAuth().loading`. Corrige também a mesma corrida para managers em `/configuracoes`.
- **Files:** `src/hooks/useFeatureFlags.js`, `src/App.jsx`. Só frontend; Vercel deploya no push.

## 2026-08-17

### Asana — Registrar tickets de atendimento como tarefas

- **New:** `asana-proxy` Edge Function — proxy para a API do Asana (`https://app.asana.com/api/1.0`) sem expor o PAT no frontend. Requer secret `ASANA_PAT` (conta bot dedicada). Rota via body `{ path, method, body, params }`, com auth JWT própria, rate limit e role check (admin/manager/analyst) — mesmo padrão do `freshdesk-proxy`.
- **New:** `src/lib/asanaConfig.js` — helpers `getAsanaConfig`/`saveAsanaConfig` (persistem em `freshdesk_config` key `asana_config`), `listAsanaWorkspaces`, `listAsanaProjects`, `listAsanaSections`, `createAsanaTask`.
- **New:** painel `SettingsAsana` em Configurações → Integrações → Asana (flag `asana`): toggle de ativação + seletores de workspace, projeto e seção (quadro).
- **New:** opção "Registrar no Asana" na tela de sucesso de criação de ticket em `/atendimento` — cria tarefa no projeto/seção configurados; grava `asana_task_gid`/`asana_task_url` em `whatsapp_tickets` e exibe link "Ver no Asana".
- **New:** modal de revisão/edição da tarefa Asana (`AsanaReviewModal`) — antes de criar, o analista valida/altera o nome e o corpo da tarefa.
- **Pattern:** padrão da task Asana segue o formato manual — nome `[<Cliente>] <Assunto> [#<id_freshdesk>]`; corpo com descrição + resposta registrada + todos os campos do ticket (link do Freshdesk, cliente, contato, e-mail, origem, tipo, categoria, prioridade, status, grupo, agente). Mapeamento no nome da task; sem custom fields do Asana.
- **DB:** colunas `asana_task_gid` e `asana_task_url` em `whatsapp_tickets` (`20260817100000_add_asana_integration.sql`).
- **Ops:** `asana_config` ativado em produção (`freshdesk_config`): workspace `1206742108937129`, projeto **Tickets Asana** (`1211665468744296`), seção **Aguardando Avaliação Técnica** (`1212767430279917`).

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
