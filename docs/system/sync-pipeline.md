# Sync Pipeline

## Overview

Pipeline de sincronização que orquestra a coleta de dados de fontes externas com rastreamento granular por serviço. Cada serviço (`donc-api`, `freshdesk`, `health-recalc`) registra seu próprio log de execução em `sync_service_log`, enquanto o orquestrador `monthly-sync` mantém compatibilidade com o `sync_log` legado.

## Architecture Role

O pipeline ocupa a camada de ingestão de dados externos do sistema:

```
Fontes externas              Edge Functions               Destino                 Rastreamento
─────────────────────────────────────────────────────────────────────────────────────────────
DONC API ──────────────→ donc-api-sync ──────────→ client_usage              sync_service_log
Freshdesk API ─────────→ monthly-sync:syncFd ────→ client_support           (planejado)
Health recalc ─────────→ monthly-sync:health ────→ health_score_history     (planejado)
Cron (pg_cron) ────────→ monthly-sync ───────────→ (orquestrador)           sync_log
Manual (Settings UI) ──→ donc-api-sync ──────────→ client_usage              sync_service_log
```

## Integration Points

| Serviço | Edge Function | Trigger | Tabela de log | ref_month | instance_id |
|---------|--------------|---------|--------------|-----------|-------------|
| DONC API | `donc-api-sync` | manual / cron / client-sync | `sync_service_log` | Sim | Sim |
| Freshdesk | `monthly-sync` (sub-chamada) | cron | `sync_service_log` (fase 2) | Sim | — |
| Health Recalc | `health-recalc` | cron / manual | `sync_service_log` (fase 2) | — | — |
| Orquestrador | `monthly-sync` | cron / manual | `sync_log` (legado) | — | — |

## Data Flow

### Write Flow — donc-api-sync (Fase 1 implementada)

```
1. Chamador invoca donc-api-sync com { trigger, month, client_id?, instance_id? }
2. EF detecta triggered_by: 'manual' | 'cron' | 'client-sync'
3. Resolve refMonth: 'previous' → mês anterior, ou YYYY-MM explícito
4. Busca instâncias ativas de client_donc_instances
5. Para CADA instância:
   a. INSERT sync_service_log { service_name:'donc-api', status:'running',
        triggered_by, ref_month:refMonth, instance_id:inst.id }
   b. GET https://webhub.donc.com.br/api/DoncCx/{contrato_saas_id}?dataInicio=...&dataFim=...
   c. Upsert client_usage (donc_snapshot + campos extraídos)
   d. UPDATE sync_service_log { status:'success', finished_at,
        summary:{synced:1,failed:0} }
6. Em caso de falha na API DONC:
   a. UPDATE sync_service_log { status:'failed', finished_at, error_message }
7. Retorna { synced, failed, errors, refMonth, dataInicio, dataFim }
```

### Write Flow — monthly-sync (Orquestrador)

```
1. Acionado por pg_cron (dia 1 de cada mês, 09:00 UTC) ou manual (sync-schedule EF)
2. INSERT sync_log { job_name:'monthly-sync', status:'running' }
3. Sequencialmente:
   a. donc-api-sync (sub-chamada fetch, mês anterior)
   b. syncFreshdesk (função interna, dados do mês anterior)
   c. health-recalc (sub-chamada fetch, todos os clientes)
   d. calculate_health_trends (RPC PostgreSQL)
4. UPDATE sync_log { status:'success'/'failed', finished_at, summary:{donc, freshdesk, health, trend} }
```

### Read Flow — Cockpit

```
1. ProfissionaisCockpitPage monta com refMonth = mês selecionado (default: anterior)
2. useQuery(['last_donc_sync', refMonth])
3. SELECT finished_at FROM sync_service_log
   WHERE service_name='donc-api' AND ref_month='2026-06' AND status='success'
   ORDER BY finished_at DESC LIMIT 1
4. Exibe na toolbar: "Última sinc: 02/07/2026, 06:01 BRT"
```

### Read Flow — Settings UI (Legado)

```
1. SettingsSyncStatus monta
2. useSyncStatus() → SELECT * FROM sync_log WHERE job_name='monthly-sync'
   ORDER BY started_at DESC LIMIT 1
3. Exibe: status badge, grid de sumário (DONC/FD/Health), histórico
```

## Coexistência sync_log ↔ sync_service_log

| Aspecto | sync_log | sync_service_log |
|---------|----------|-----------------|
| Criação | `20260701000000` | `20260727210000` |
| Granularidade | 1 por execução do orquestrador | 1 por serviço por instância |
| Serviços | Todos em um summary JSONB | donc-api (fase 1) |
| RLS | Ativo (authenticated SELECT, service_role INSERT/UPDATE) | Desabilitado (GRANT SELECT) |
| Consumido por | SettingsSyncStatus | ProfissionaisCockpitPage |
| Escrito por | monthly-sync | donc-api-sync |

**Nota:** As duas tabelas coexistem sem conflito. `sync_log` continua servindo o SettingsSyncStatus existente. `sync_service_log` adiciona granularidade para o cockpit e futuramente substituirá `sync_log` no SettingsSyncStatus (fase 2).

## Known Issues

- **Timestamp não renderiza no cockpit** (2026-07-28): query `sync_service_log` retorna vazio via `useQuery` mesmo com dados na tabela e RLS desabilitado. Browser confirma acesso via `fetch` direto. Investigação pendente.
- **Over-engineering**: uma coluna `synced_at` + trigger no `client_usage` teria resolvido o requisito original (exibir timestamp no cockpit) sem tabela nova, sem RLS novo, sem edge function modificada.
