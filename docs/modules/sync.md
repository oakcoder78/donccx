# Sync (Sincronização)

## Purpose

Subsistema que orquestra a coleta de dados de fontes externas (DONC API, Freshdesk, Health Score) e rastreia execuções com granularidade por serviço via `sync_service_log`. Permite que o frontend exiba timestamps de última sincronização e status de execuções.

## Responsibilities

- Registrar início e fim de cada execução de sync por serviço (`donc-api`, `freshdesk`, `health-recalc`)
- Diferenciar triggers: `manual` (Settings UI), `cron` (agendado dia 1), `client-sync` (sync de cliente único)
- Associar syncs a `ref_month` e `instance_id` para granularidade de consulta
- Expor dados para frontend: cockpit de profissionais (última sinc DONC) e Settings (status/histórico)
- Coexistir com a tabela legada `sync_log` (orquestrador monolítico)

## Key Components

| Componente | Arquivo | Função |
|---|---|---|
| `sync_service_log` | `supabase/migrations/20260727210000_create_sync_service_log.sql` | Tabela de rastreamento por serviço/instância |
| `sync_log` | `supabase/migrations/20260701000000_create_sync_log_table.sql` | Tabela legada do orquestrador `monthly-sync` |
| `donc-api-sync` | `supabase/functions/donc-api-sync/index.ts` | Edge Function que faz INSERT/UPDATE no `sync_service_log` por instância |
| `monthly-sync` | `supabase/functions/monthly-sync/index.ts` | Orquestrador cron — dispara sub-serviços sequencialmente |
| `useSyncStatus` | `src/hooks/useSyncStatus.js` | Hook de leitura do `sync_log` (legado) |
| `SettingsSyncStatus` | `src/components/settings/SettingsSyncStatus.jsx` | UI de status, agendamento e histórico de execuções |
| `ProfissionaisCockpitPage` | `src/pages/ProfissionaisCockpitPage.jsx` | Cockpit que consome `sync_service_log` para exibir timestamp |

## Data Interaction

### Tabelas

| Tabela | Propósito | Colunas principais |
|--------|-----------|-------------------|
| `sync_service_log` | Rastreamento granular por serviço/instância | `service_name`, `status`, `started_at`, `finished_at`, `triggered_by`, `ref_month`, `instance_id`, `summary` |
| `sync_log` | Registro do orquestrador (legado) | `job_name`, `status`, `started_at`, `finished_at`, `summary` |

### Índices

| Índice | Query atendida |
|--------|---------------|
| `idx_sync_service_lookup (service_name, ref_month, status)` | Cockpit: última sinc DONC para um mês |
| `idx_sync_service_latest (service_name, started_at DESC)` | Settings UI: última execução por serviço |
| `idx_sync_service_stuck (status, started_at) WHERE status='running'` | Operacional: detectar jobs travados |

### Relacionamentos

- `instance_id → client_donc_instances(id) ON DELETE SET NULL`
- `ref_month` espelha o formato `YYYY-MM` de `client_usage.ref_month`

### RLS

Desabilitada (`20260728200000_disable_rls_sync_service_log.sql`). `GRANT SELECT TO anon, authenticated`. Escrita via `service_role` nas Edge Functions. Sem dados sensíveis — apenas timestamps e metadados de sync.

### Fluxo de escrita (donc-api-sync)

```
Chamador (manual/cron/client-sync) → donc-api-sync
  → para cada instância:
      1. INSERT sync_service_log {status:'running', triggered_by, ref_month, instance_id}
      2. Chama DONC API → upsert client_usage
      3. UPDATE sync_service_log {status:'success'/'failed', finished_at, summary/error_message}
```

### Fluxo de leitura (Cockpit)

```
ProfissionaisCockpitPage
  → useQuery(['last_donc_sync', refMonth])
  → SELECT finished_at FROM sync_service_log
     WHERE service_name='donc-api'
       AND ref_month='2026-06'
       AND status='success'
     ORDER BY finished_at DESC LIMIT 1
  → renderiza "Última sinc: DD/MM/AAAA HH:MM BRT" na toolbar
```

## UI Behavior

### Cockpit de Profissionais
- Toolbar exibe `🕐 Última sinc: 01/08/2026, 00:02 BRT` alinhado à direita
- Se não houver sync para o mês: não renderiza o elemento (ou "Nunca sincronizado")

### Settings > Status da Sincronização
- Card de status com badge (Sucesso ✓ / Falha ✗ / Nunca executou)
- Grid de resumo: DONC API (synced), Freshdesk (empresas), Health Score (clientes)
- Histórico de execuções com tabela: Início, Duração, Status, DONC, FD, Health, Erro
- Agendamento automático: presets (Mensal/Trimestral/Semestral) + próxima execução

### Settings > API DONC
- Botão "Sincronizar" com resultado inline (synced/failed/errors)
- Contagem de registros pendentes (`client_usage WHERE pending=true`)

## Dependencies

- `sync_log` (tabela legada — coexistência)
- `client_donc_instances` (FK instance_id)
- `client_usage` (dados sincronizados pela DONC API)
- Feature flags: `api_donc`, `freshdesk`

## Coexistência sync_log ↔ sync_service_log

| Aspecto | sync_log | sync_service_log |
|---------|----------|-----------------|
| Granularidade | 1 por execução do orquestrador | 1 por serviço por instância |
| Serviços cobertos | Todos (donc, freshdesk, health, trend) em um summary JSONB | donc-api apenas (fase 1) |
| Usado por | SettingsSyncStatus (legado) | Cockpit de profissionais (novo) |
| Escrita | monthly-sync (orquestrador) | donc-api-sync (serviço individual) |
