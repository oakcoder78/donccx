# Sync Pipeline

## Overview

Pipeline de sincronização que orquestra a coleta de dados de fontes externas com rastreamento granular por serviço. Cada serviço (`donc-api`, `freshdesk`, `health-recalc`) registra seu próprio log de execução em `sync_service_log`, enquanto o orquestrador `monthly-sync` mantém compatibilidade com o `sync_log` legado.

O horizonte de recorrência das séries contratuais **não** faz parte do orquestrador mensal. Ele tem Edge Function e cron próprios (`contract-series-sync`), porque `ensure_series_horizon` é idempotente e não tem nada a ver com nenhuma API externa — ver "Horizonte de recorrência" abaixo e `docs/sdd/contract-series-lifecycle-sdd.md`.

## Architecture Role

O pipeline ocupa a camada de ingestão de dados externos do sistema:

```
Fontes externas              Edge Functions               Destino                 Rastreamento
─────────────────────────────────────────────────────────────────────────────────────────────
DONC API ──────────────→ donc-api-sync ──────────→ client_usage              sync_service_log
Freshdesk API ─────────→ monthly-sync:syncFd ────→ client_support           (planejado)
Health recalc ─────────→ monthly-sync:health ────→ health_score_history     (planejado)
Cron (pg_cron) ────────→ monthly-sync ───────────→ (orquestrador mensal)     sync_log
Cron (pg_cron) ────────→ contract-series-sync ────→ contract_charges          (log da EF)
Manual (Settings UI) ──→ donc-api-sync ──────────→ client_usage              sync_service_log
Manual (Settings UI) ──→ sync-schedule:run-horizon → contract-series-sync ──→ contract_charges
```

## Integration Points

| Serviço | Edge Function | Trigger | Tabela de log | ref_month | instance_id |
|---------|--------------|---------|--------------|-----------|-------------|
| DONC API | `donc-api-sync` | manual / cron / client-sync | `sync_service_log` | Sim | Sim |
| Freshdesk | `monthly-sync` (sub-chamada) | cron | `sync_service_log` (fase 2) | Sim | — |
| Health Recalc | `health-recalc` | cron / manual | `sync_service_log` (fase 2) | — | — |
| Orquestrador | `monthly-sync` | cron / manual | `sync_log` (legado) | — | — |
| Horizonte de séries | `contract-series-sync` | cron (dia 1) / manual (Settings) | log da própria EF | derivado do horizon | — |

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
1. Acionado por pg_cron (job 'monthly-sync-job', 1 0 1 * * = 00:01 UTC) ou manual
   (sync-schedule EF, action 'run-now')
2. INSERT sync_log { job_name:'monthly-sync', status:'running' }
3. Sequencialmente:
   a. donc-api-sync (sub-chamada fetch, mês anterior)
   b. syncFreshdesk (função interna, dados do mês anterior)
   c. health-recalc (sub-chamada fetch, todos os clientes)
   d. calculate_health_trends (RPC PostgreSQL)
4. UPDATE sync_log { status:'success'/'failed', finished_at, summary:{donc, freshdesk, health, trend} }
```

O orquestrador **não** materializa recorrência. Rodar `ensure_series_horizon` aqui significava que a folga das séries só existia uma vez por mês, herdava a falha de qualquer serviço externo e não podia ser recuperada isoladamente — daí o serviço separado.

### Write Flow — contract-series-sync (Horizonte de recorrência)

```
1. Acionado por pg_cron (job 'contract-series-sync-job', 5 0 1 * * = 00:05 UTC,
   4 minutos depois do orquestrador) ou manual (sync-schedule EF, action 'run-horizon')
2. SELECT id FROM contract_series WHERE status='ativa'
3. Para CADA série: SELECT ensure_series_horizon(series_id)
   - Idempotente: a segunda chamada seguida não insere nada.
   - Uma série com erro é registrada e não derruba as outras.
   - Só escreve contract_charges. Nunca cria billing_payments de mês futuro —
     a folga é inerte e pré-marcar pagamento que não venceu seria errado.
4. Loga em stdout { series, launched, por_serie, erros }
```

Manual é o caminho de recuperação: depois de um lançamento em lote no meio do mês, as séries novas precisam da folga agora — esperar o dia 1 as deixaria invisíveis no cockpit. O botão em Configurações → Sincronização faz exatamente essa chamada.

### Read Flow — Settings UI (Horizonte)

```
1. Configurações → Sincronização → botão "Repor horizonte"
2. sync-schedule { action:'run-horizon' } (admin/manager, ou x-webhook-secret)
3. POST contract-series-sync com x-webhook-secret
4. Toast com quantas séries foram estendidas e quantos meses entraram
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
| RLS | Ativo (authenticated SELECT, service_role INSERT/UPDATE) | Desabilitado (`20260728200000`); `GRANT SELECT TO anon, authenticated`. Policy `Enable read access for all users` (PUBLIC) removida em `20260728000000` como cleanup defensivo. |
| Consumido por | SettingsSyncStatus | ProfissionaisCockpitPage |
| Escrito por | monthly-sync | donc-api-sync |

**Nota:** As duas tabelas coexistem sem conflito. `sync_log` continua servindo o SettingsSyncStatus existente. `sync_service_log` adiciona granularidade para o cockpit e futuramente substituirá `sync_log` no SettingsSyncStatus (fase 2).

## Known Issues

- **Over-engineering** (rejected alternative): uma coluna `synced_at` + trigger no `client_usage` teria resolvido o requisito mínimo (exibir timestamp no cockpit) sem tabela nova, sem RLS novo, sem edge function modificada. Decisão (2026-07-28): manter `sync_service_log` porque a tabela abre caminho para granularidade por instância (`instance_id`) e fase 2 (migrar `SettingsSyncStatus` de `sync_log` para `sync_service_log` agrupando por `service_name`). A rejeição fica registrada para reavaliação se a fase 2 for cancelada.
- **`manage_cron_job` tem URL padrão fixa** (`monthly-sync`). Agendar um job novo sem passar `p_url` cria silenciosamente um **segundo** agendamento do orquestrador — foi o que aconteceu com `contract-series-sync-job` em 2026-10-02 (criou jobid 14 apontando para `monthly-sync`). Ao agendar qualquer serviço que não seja o orquestrador, `p_url` é obrigatório, e vale conferir `cron.job` depois.
- **Fuso na tela de cron**: `SettingsSyncStatus` converte `cron.job.schedule` com `UTC_TO_BRT` e soma 3h sobre um valor que já é BRT. O agendamento está certo; a exibição mente. Registrado como `TD-013`.
- Resolvido em 2026-07-28 (`a685e9f` + `2f14ef5`): o timestamp não renderizava porque o `queryFn` do `useQuery` retornava o envelope `{data, error}` do supabase enquanto o destructuring `const { data: lastSync }` esperava o row direto — `lastSync.finished_at` era sempre `undefined`. QueryFn agora retorna `data` explicitamente e `throw error` em caso de falha, espelhando o padrão de `useProfissionaisCockpit.js:29-31`.
