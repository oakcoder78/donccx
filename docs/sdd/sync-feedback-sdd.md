# SDD — Sync Feedback UX (Feedback Visual de Sincronização)

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for improving the user-facing feedback of the DONC API and Freshdesk sync features in doncCX Hub. It covers error visibility, confirmation dialogs, cron status awareness, and error message quality. It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

### How to use this document

1. **Before implementing:** Read this document fully. Understand the existing feedback patterns and the specific gaps each phase addresses.
2. **During implementation:** Follow the checklist for the active phase. Mark items ✅ as they are completed and verified.
3. **After implementation:** Fill the Implementation Log for the completed phase and update Section 0.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main`
- **Last deploy:** `donccx.vercel.app` (commit `54cd5a7`, 2026-07-18)
- **Active phase:** All phases complete ✅
- **SDD lifecycle stage:** Active

**What already exists related to this work:**

- `react-hot-toast` — único sistema de notificação, configurado em `App.jsx` com `<Toaster position="top-right" toastOptions={{ duration: 3000 }} />`
- `src/components/ui/Modal.jsx` — componente `Modal({ isOpen, onClose, title, children, maxWidth })`
- `src/components/ui/Badge.jsx` — componente `Badge({ variant, children, className })`
- `src/components/ui/Button.jsx` — componente `Button({ variant, size, className, children, ...props })`
- `src/components/dashboard/DashboardPage.jsx` — contém `handleSync()` com estado `syncing[instId]` = `'syncing' | 'done' | 'error'`, mas **sem toast no catch** (linha 729-731)
- `src/pages/DoncAPIPendentes.jsx` — usa `window.confirm()` para ações em massa (linhas 259, 268)
- `src/components/settings/SettingsDoncAPI.jsx` — sync manual com box verde/amber inline + toast
- `src/components/settings/SettingsFreshdesk.jsx` — sync manual com box verde + toast
- `src/components/settings/SettingsPage.jsx` — página de settings com `MENU_GROUPS`, `SETTINGS_MENU_ICONS`, `renderContent()`
- `supabase/functions/monthly-sync/index.ts` — Edge Function orquestradora do cron
- `cron.job_run_details` — tabela do `pg_cron` que registra execuções (jobid=4 = monthly-sync-job)
- Tabela `client_usage` com colunas `id`, `client_id`, `ref_month`, `pending`, `partial_day`, `donc_snapshot`
- Tabela `client_support` com colunas `id`, `client_id`, `ref_month`, `pending`, `freshdesk_snapshot`
- `src/components/settings/SettingsSyncStatus.jsx` — UI de agendamento de sincronização mensal: presets, cron customizado, one-off, histórico, botão "Executar agora"
  - `toBRT()` — compat reversa: converte cron UTC antigo (`1 0 …`) para BRT (`1 3 …`) na exibição, sem re-salvar no DB
  - Agendamento semanal ("Semanas") no dropdown Personalizado
  - Texto explicativo BRT abaixo do botão Salvar: "As execuções ocorrem às 00:01 BRT..."
  - Botões Executar/Salvar: mesma cor (#59c2ed) e mesma largura (minWidth: 96)

**What does NOT exist and needs to be created:**

- Indicador visual de status do último cron automático (Settings ou header global)
- Toast de erro no `handleSync()` do DashboardPage quando sync falha
- Substituição do `window.confirm()` por `Modal` do projeto em DoncAPIPendentes
- Mapeamento de erros conhecidos das Edge Functions para mensagens amigáveis
- Botão "tentar novamente" inline nos erros de sync

### Files to be touched

| File | Change type | Status |
|---|---|---|---|
| `src/components/settings/SettingsSyncStatus.jsx` | **Create** | Planned |
| `src/hooks/useSyncStatus.js` | **Create** | Planned |
| `src/components/settings/SettingsPage.jsx` | Modify — add sync-status menu item | Planned |
| `src/components/dashboard/DashboardPage.jsx` | Modify — add toast.error in handleSync catch | ✅ Phase 1 |
| `src/pages/DoncAPIPendentes.jsx` | Modify — replace window.confirm with Modal | ✅ Phase 2 |
| `src/components/settings/SettingsDoncAPI.jsx` | Modify + retry | Planned |
| `src/components/settings/SettingsFreshdesk.jsx` | Modify + retry | Planned |
| `src/lib/syncErrors.js` | **Create** — friendlyError map | ✅ Phase 1 |
| `src/components/dashboard/SyncButton.jsx` | **Create** — extracted sync button | Planned |

---

## 1. Global Definitions

### 1.1 Error Mapping (`src/lib/syncErrors.js`)

```javascript
const KNOWN_ERRORS = {
  'schema "net" does not exist':
    'Sincronização automática desabilitada — extensão pg_net não instalada no banco.',
  'HTTP 401':
    'Falha de autenticação com a API DONC. Verifique as credenciais.',
  'HTTP 404':
    'Instância não encontrada na API DONC. Verifique o contrato_saas_id.',
  'HTTP 500':
    'Erro interno no servidor DONC. Tente novamente mais tarde.',
  'HTTP 502':
    'Gateway da API DONC indisponível. Tente novamente em alguns minutos.',
  'HTTP 503':
    'API DONC temporariamente indisponível. Tente novamente.',
  'ETIMEDOUT':
    'Tempo limite excedido ao conectar com a API DONC. Tente novamente.',
  'ENOTFOUND':
    'Servidor DONC não encontrado. Verifique a conectividade.',
  'Internal error':
    'Erro interno no servidor. Tente novamente ou contate o suporte.',
}

export function friendlyError(errorMessage) {
  if (!errorMessage) return 'Erro desconhecido.'
  for (const [pattern, friendly] of Object.entries(KNOWN_ERRORS)) {
    if (errorMessage.includes(pattern)) return friendly
  }
  return errorMessage
}
```

### 1.2 Sync Status Types

```javascript
const SYNC_STATUS = {
  NEVER:   'never',
  OK:      'ok',
  FAILED:  'failed',
  RUNNING: 'running',
}
```

### 1.3 Feature flag

- Reuse existing flags: `freshdesk` and `api_donc`
- Menu key: `'sync-status'`
- Menu label: `'Status da Sincronização'`

---

## 2. Design System Reference

Follow these existing files as templates for style and patterns:

- **Settings page style:** `src/components/settings/SettingsAI.jsx` — inline `S` style object, section + label patterns
- **Icons:** Always use `src/lib/icons.js`
- **Toast patterns:** `src/components/settings/SettingsFreshdesk.jsx` (linha 300-303) — sucesso/erro com `toast.success` / `toast('...', { icon })`
- **Modal usage:** `src/components/ui/Modal.jsx` — usado em `RegistrarDadosModal.jsx` e outros modais do projeto
- **Sync result display:** `src/components/settings/SettingsDoncAPI.jsx` — box verde/amber inline com resumo + erros
- **Dashboard sync pattern:** `src/components/dashboard/DashboardPage.jsx` linhas 704-731 — `handleSync` com `syncing` state

---

## 3. Component Tree

### 3.1 SyncStatus (Settings page)

```
SettingsSyncStatus
├── Header ("Status da Sincronização Automática")
├── LastSyncCard
│   ├── StatusBadge (✅ Sucesso | ❌ Falha | ⏳ Nunca executou)
│   ├── LastRunTime ("Última execução: 01/07/2026 00:01 UTC")
│   ├── ErrorMessage (se falhou: mensagem amigável)
│   └── NextRunTime ("Próxima execução: 01/08/2026 00:01 UTC")
├── SyncSummary
│   ├── DoncLastSync ("DONC API: 32 instâncias sincronizadas")
│   └── FreshdeskLastSync ("Freshdesk: 15 empresas sincronizadas")
└── ManualTriggerButton ("Executar agora" — se admin/manager)
```

### 3.2 Dashboard sync button (extracted)

```
SyncButton
├── Button ("sincronizar" | "sincronizando…" | "ok ✓")
├── ErrorTooltip (se estado='error': mostra mensagem de erro no hover)
└── Toast.onError (se estado='error': toast.error com mensagem amigável)
```

### 3.3 Modal de confirmação (DoncAPIPendentes)

```
ConfirmModal (reutiliza Modal do projeto)
├── Título: "Confirmar ação"
├── Mensagem: "Aprovar todos os N registros pendentes?"
├── Ações: [Cancelar] [Confirmar]
└── onClose → fecha; onConfirm → executa ação
```

---

## 4. Data Contracts

### 4.1 Sync Status Query (`useSyncStatus` hook)

```javascript
import { supabase } from '../lib/supabaseClient'

export function useSyncStatus() {
  // Busca última execução sync_log (criado na Phase 3)
  // supabase.from('sync_log').select('*').eq('job_name', 'monthly-sync')
  //   .order('started_at', { ascending: false }).limit(1).maybeSingle()
}
```

### 4.2 `sync_log` table (backend addition, Phase 3)

```sql
create table public.sync_log (
  id            bigint generated always as identity primary key,
  job_name      text not null default 'monthly-sync',
  status        text not null check (status in ('running', 'success', 'failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  summary       jsonb,
  error_message text
);

create index idx_sync_log_job_started on public.sync_log (job_name, started_at desc);
```

### 4.3 Dashboard sync — error fix

Current (silent error):
```javascript
} catch {
  setSyncing(s => ({ ...s, [instId]: 'error' }))
}
```

Target:
```javascript
} catch (e) {
  setSyncing(s => ({ ...s, [instId]: 'error' }))
  toast.error(friendlyError(e?.message || 'Erro na sincronização'))
}
```

### 4.4 DoncAPIPendentes — confirmation modal

Target pattern:
```jsx
<Modal isOpen={!!confirmAction} onClose={() => setConfirmAction(null)} title="Confirmar ação">
  <p>{confirmAction?.type === 'approve-all'
    ? `Aprovar todos os ${confirmAction.count} registros pendentes?`
    : `Rejeitar todos os ${confirmAction.count} registros pendentes?`}
  </p>
  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
    <Button variant="ghost" onClick={() => setConfirmAction(null)}>Cancelar</Button>
    <Button variant={confirmAction?.type === 'approve-all' ? 'primary' : 'danger'}
      onClick={handleConfirm}>
      {confirmAction?.type === 'approve-all' ? 'Aprovar todos' : 'Rejeitar todos'}
    </Button>
  </div>
</Modal>
```

---

## 5. Implementation Phases

### Phase 1 — Dashboard error toast + error mapping

**Status:** Complete

**Rationale:** O gap mais crítico é o erro silencioso no dashboard — o CSM clica em "sincronizar", falha, e não recebe feedback nenhum. Também criamos o mapa centralizado de erros para que todas as telas usem mensagens amigáveis.

**Scope:**
- Criar `src/lib/syncErrors.js` com mapa de erros conhecidos
- Adicionar `toast.error()` no catch do `handleSync` no DashboardPage

#### Checklist

- [x] **Error map:** Create `src/lib/syncErrors.js`
  - [x] Implement `friendlyError(errorMessage)` function with `KNOWN_ERRORS` map
- [x] **Dashboard error toast:** Modify `src/components/dashboard/DashboardPage.jsx`
  - [x] Add `import { friendlyError } from '../../lib/syncErrors'` and `import toast from 'react-hot-toast'`
  - [x] Update catch block: add toast.error with friendly error message
- [x] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-07-01 | — | src/lib/syncErrors.js, src/components/dashboard/DashboardPage.jsx | friendlyError map + toast.error no catch do handleSync |

---

### Phase 2 — Confirmation Modal (DoncAPIPendentes)

**Status:** Complete

**Rationale:** O `window.confirm()` é um padrão pobre de UX — não é estilizável, quebra a imersão, e não oferece segurança. O projeto já tem componente `Modal` pronto para substituir.

**Scope:**
- Substituir `window.confirm()` por `Modal` nas ações em massa de aprovar/rejeitar

#### Checklist

- [x] **Modal state:** Add `confirmAction` state to `src/pages/DoncAPIPendentes.jsx`
  - [x] `const [confirmAction, setConfirmAction] = useState(null)`
  - [x] Type: `{ type: 'approve' | 'reject', count: number }` or null
- [x] **Modal rendering:** Add `<Modal>` component below the main content
  - [x] Import `{ Modal }` from `'../components/ui/Modal'`
  - [x] Import `{ Button }` from `'../components/ui/Button'`
  - [x] Render confirmation modal with message, Cancel + Confirm buttons
  - [x] Use Button variant="ghost" for cancel, "primary"/"danger" for confirm
- [x] **Wire up:** Replace `window.confirm(...)` calls with `setConfirmAction(...)`
  - [x] Create `handleBulkConfirm` that runs approve-all or reject-all based on `confirmAction.type`
  - [x] `approveAll()` sets confirmAction instead of calling window.confirm
  - [x] `rejectAll()` sets confirmAction instead of calling window.confirm
- [x] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-07-01 | — | src/pages/DoncAPIPendentes.jsx | window.confirm → Modal with confirmAction state |

---

### Phase 3 — Cron Sync Status Indicator

**Status:** Complete

**Scope:**
- Criar migration para tabela `sync_log`
- Modificar `monthly-sync` para registrar execução
- Criar hook `useSyncStatus`
- Criar componente `SettingsSyncStatus`
- Adicionar ao menu de settings

#### Checklist

- [x] **Backend — migration:** Create `supabase/migrations/20260701000000_create_sync_log_table.sql`
- [x] **Backend — migration:** Create `supabase/migrations/20260701000001_enable_pgnet.sql` (root cause fix)
- [x] **Backend — Edge Function:** Modify `supabase/functions/monthly-sync/index.ts` to insert/update sync_log
- [x] **Hook:** Create `src/hooks/useSyncStatus.js`
- [x] **Component:** Create `src/components/settings/SettingsSyncStatus.jsx`
- [x] **Settings menu:** Modify `src/components/settings/SettingsPage.jsx`
- [x] **Deploy:** `npx supabase db push --include-all` (both migrations)
- [x] **Deploy:** `npx supabase functions deploy monthly-sync`
- [x] **Verify:** `verify_jwt=false` confirmed on deployed function
- [x] **Verify:** `pg_cron` + `pg_net` both installed in production

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-07-01 | — | supabase/migrations/20260701000000_create_sync_log_table.sql | sync_log table + RLS policies |
| 2026-07-01 | — | supabase/migrations/20260701000001_enable_pgnet.sql | Enable pg_net extension (cron root cause) |
| 2026-07-01 | — | supabase/functions/monthly-sync/index.ts | Insert sync_log on start, update on success/failure |
| 2026-07-01 | — | src/hooks/useSyncStatus.js | Query last sync_log entry |
| 2026-07-01 | — | src/components/settings/SettingsSyncStatus.jsx | Status card with badge, error msg, summary grid |
| 2026-07-01 | — | src/components/settings/SettingsPage.jsx | Add sync-status to menu, icon, renderSection |

---

### Phase 4 — Error message quality + Retry buttons

**Status:** Complete

**Scope:**
- Aplicar `friendlyError()` em SettingsDoncAPI e SettingsFreshdesk
- Adicionar botão "Tentar novamente" inline no erro

#### Checklist

- [x] **SettingsDoncAPI:** Apply `friendlyError()` + retry button
- [x] **SettingsFreshdesk:** Apply `friendlyError()` + retry button
- [x] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-07-01 | — | src/components/settings/SettingsDoncAPI.jsx | friendlyError on toast + error list + retry button |
| 2026-07-01 | — | src/components/settings/SettingsFreshdesk.jsx | friendlyError on all toasts + error list + retry button |

---

### Phase 5 — Global sync alert + Scheduling + History

**Status:** Complete ✅

**Scope:**
- Badge global no header quando última sync automática falhou
- Polling a cada 5 minutos do `useSyncStatus`
- Botão "Executar agora" na página de Status com seletor de mês
- Histórico das últimas 15 execuções em tabela
- Agendamento flexível (presets + custom cron + one-off)

#### Checklist

- [x] **Migration:** RPC `manage_cron_job` (SECURITY DEFINER) para schedule/unschedule/get_config via pg_cron
- [x] **Edge Function:** `sync-schedule` — proxy para frontend chamar RPC + disparar monthly-sync diretamente
- [x] **EF monthly-sync:** Auto-unschedule one-off jobs após execução
- [x] **Hook:** `useSyncHistory` — query `sync_log` com limit
- [x] **Navbar:** Badge `AlertTriangle` sync failure para admin/manager
- [x] **SettingsSyncStatus:** Seção "Executar agora" com month picker
- [x] **SettingsSyncStatus:** Seção "Agendamento" com presets + custom cron + one-off datepicker
- [x] **SettingsSyncStatus:** Seção "Histórico" com tabela de execuções
- [x] **Build:** `npm run build` sem erros
- [x] **Deploy:** Migration `20260701000002` → `sync-schedule` EF → `monthly-sync` EF v23
- [x] **Commit+Push:** `a959371`
- [x] `toBRT()` — backward compat for old UTC cron (`1 0 … → 1 3 …`) on display
- [x] Weekly schedule support (`semanas` option in custom dropdown)
- [x] BRT explanation text in schedule card
- [x] Both buttons same color (#59c2ed) and width (minWidth: 96)

#### Implementation Log (Phase 5)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-07-01 | `a959371` | `supabase/migrations/20260701000002_create_manage_cron_job_rpc.sql` | RPC SECURITY DEFINER para gerenciar cron.job (schedule/unschedule/get_config) |
| 2026-07-01 | `a959371` | `supabase/functions/sync-schedule/index.ts` (new) | Edge Function `sync-schedule` — actions: `run-now`, `set-schedule`, `schedule-oneoff`, `get-config` |
| 2026-07-01 | `a959371` | `supabase/functions/monthly-sync/index.ts` (mod) | Auto-unschedule `monthly-sync-oneoff` após execução bem-sucedida |
| 2026-07-01 | `a959371` | `supabase/config.toml` | `verify_jwt = false` para sync-schedule |
| 2026-07-01 | `a959371` | `src/hooks/useSyncStatus.js` (mod) | Novo export `useSyncHistory({ limit })` para listar execuções passadas |
| 2026-07-01 | `a959371` | `src/components/settings/SettingsSyncStatus.jsx` (mod) | 4 seções: status, executar agora, agendamento, histórico |
| 2026-07-01 | `a959371` | `src/components/layout/Navbar.jsx` (mod) | Badge `AlertTriangle` no header para admin/manager quando `sync_log.status === 'failed'` |
| 2026-07-18 | `1e5ee63` | `src/components/settings/SettingsSyncStatus.jsx` | `toBRT()` — upgrade old UTC cron to BRT at display time; remove `OLD_PRESETS` |
| 2026-07-18 | `331edba` | `src/components/settings/SettingsSyncStatus.jsx` | Add weekly schedule (`semanas`) + BRT info text |
| 2026-07-18 | `13de41f` | `src/components/settings/SettingsSyncStatus.jsx` | Both buttons same color (#59c2ed) and minWidth:96 |
| 2026-07-18 | `54cd5a7` | `src/components/settings/SettingsSyncStatus.jsx` | Center text inside buttons with justifyContent |

---

## 6. Current Checkpoint

### Production state

- Dashboard sync exibe `toast.error()` com mensagem amigável quando falha ✅ (Phase 1)
- DoncAPIPendentes usa `Modal` do projeto no lugar de `window.confirm()` ✅ (Phase 2)
- Mensagens de erro mapeadas via `friendlyError()` em todas as telas de sync ✅ (Phase 1 + 4)
- SettingsDoncAPI e SettingsFreshdesk com mensagens amigáveis + botão "Tentar novamente" nos erros ✅ (Phase 4)
- Tabela `sync_log` criada + Edge Function `monthly-sync` registra execuções ✅ (Phase 3)
- Componente `SettingsSyncStatus` disponível em Configurações → Integrações → Status da Sincronização ✅ (Phase 3)
- Badge global no header quando sync falha + link para Configurações ✅ (Phase 5)
- Histórico das últimas 15 execuções em tabela na página de Status ✅ (Phase 5)
- Botão "Executar agora" com seletor de mês na página de Status ✅ (Phase 5)
- Agendamento flexível (presets, custom cron, one-off datepicker) na página de Status ✅ (Phase 5)
- `toBRT()` — DB cron `1 0 …` exibido como `00:01 BRT` sem re-save ✅
- Schedule "Semanal" disponível no dropdown Personalizado ("Semanas") ✅
- Texto explicativo "00:01 BRT, primeiro dia, segundas para semanal" ✅
- Botões Executar/Salvar: mesma cor (#59c2ed) e largura (minWidth 96) ✅
- RPC `manage_cron_job + Edge Function sync-schedule` para gerenciar cron via frontend ✅ (Phase 5)
- `monthly-sync` auto-unschedule one-off jobs após execução ✅ (Phase 5)
- **`pg_net` extension habilitada** — cron automático deve funcionar em 01/08/2026 ✅ (fix adicional)
- **Todas as 5 fases completas** ✅

### Architectural decisions

| Decision | Rationale |
|---|---|
| Tabela `sync_log` separada em vez de expor `cron.job_run_details` via REST API | O schema `cron` não é exposto pela REST API do Supabase. Expor via RPC seria possível, mas criar uma tabela própria é mais simples e dá controle sobre o schema. |
| `friendlyError()` centralizado em lib | Todas as telas de sync podem importar do mesmo lugar. Fácil de estender com novos padrões de erro sem modificar cada componente. |
| Modal do projeto em vez de `window.confirm()` | Consistência visual com o resto do app. Suporte a temas, animações, e acessibilidade. |
| Phase 5 expandida (schedule + history + one-off) | O badge global foi implementado junto com features reativas de agendamento sob demanda. Maior valor agregado que apenas o badge. |
| Cron status como página de settings, não dashboard | O público do status do cron é admin/manager, que já está familiarizado com a página de settings. Evita poluir o dashboard do CSM. |
| Polling de 5 min no sync status | A Edge Function monthly-sync roda uma vez por mês, então polling pesado não faz sentido. |
| RPC `manage_cron_job` SECURITY DEFINER | Necessário para admin/manager poderem gerenciar `cron.job` via REST API, que não expõe o schema cron. O RPC roda com permissões de superuser apenas para as operações de cron. |
| `sync-schedule` EF como proxy de gerenciamento | Centraliza a lógica de agendamento em uma EF que autentica o usuário (JWT) e chama o RPC. Evita expor o RPC diretamente para o frontend. |
| One-off job auto-unschedule | O job `monthly-sync-oneoff` é removido pela própria `monthly-sync` após execução bem-sucedida. Evita execuções anuais indesejadas do mesmo schedule. |

---

## 7. Project Gotchas — do not skip

- **Icons:** Never import directly from `lucide-react`. Always use `src/lib/icons.js`. Verify icon name (e.g., `Icons.Clock`) exists before committing.
- **Supabase deploy:** After `npx supabase functions deploy monthly-sync`, "Verify JWT" is automatically re-enabled — disable manually in Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** Worktree disabled. All work goes directly to `main`.
- **`monthly-sync` Edge Function timeout:** The function calls 3 sub-functions + 2 APIs. If total execution > 60s (Supabase Function timeout), consider increasing timeout in `config.toml`.
- **`sync_log` table RLS:** Sync functions use service_role key (admin client). Table must have `alter table sync_log enable row level security;` and a policy allowing service_role insert/update and authenticated users (admin/manager) to read.
- **Settings page structure:** `renderContent()` in `SettingsPage.jsx` uses a switch statement. Add the new case in the same format as existing entries.
- **DashboardPage size:** File is 1771 lines. When modifying `handleSync`, be surgical — do not refactor or move unrelated code.
- **DoncAPIPendentes counter:** The `rows.length` in confirm messages counts visible rows after filtering. This matches current `window.confirm()` behavior.

---

## 8. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — understand what exists and what will be created.
2. Read the relevant content sections before writing any code.
3. Identify the **active phase** via its checklist status.
4. Implement item by item. Mark ✅ when done and verified.
5. After each significant item, run `npm run build` to ensure nothing broke.
6. At the end of the phase, fill in the **Implementation Log**.
7. Update the **Checkpoint** section with the new production state.
8. **Phase 3 requires backend changes.** Deploy migration before deploying the function. Follow the deploy sequence in AGENTS.md: migration → function deploy → Vercel deploy.
9. **Do not modify `supabase/functions/donc-api-sync/index.ts`** — it only needs changes if error messages from it are unclear, which is handled at the frontend level by `friendlyError()`.
10. **All phases complete.** Phase 5 included header badge, scheduling UI, history table, `sync-schedule` EF, and `manage_cron_job` RPC. Post-deployment refinements added `toBRT()` backward compat, weekly schedule ("Semanas"), BRT explanation text, and UI polish (buttons same color/width). See Implementation Log for details.

### Technical Summary Template (fill at the end of each phase)

```
### Technical Summary — Phase X

**Commits:** hash1, hash2
**Files created:** [list]
**Files modified:** [list]
**Files deleted:** [list]

**Decisions:**
- [decision and rationale]

**Issues found:**
- [problem and solution]

**Pending items:**
- [items not covered or deferred]
```
