# Phase 2: Edge Function

## Objective

Modificar `donc-api-sync/index.ts` para registrar entrada em `sync_service_log` por instância sincronizada.

## Scope

- Modify: `supabase/functions/donc-api-sync/index.ts`

## Preconditions

- Phase 1 complete (sync_service_log table exists)

## Tasks

1. Dentro do loop `for (const inst of instances)`, antes da chamada à API DONC:
   - INSERT `{ service_name: 'donc-api', status: 'running', triggered_by, ref_month: refMonth, instance_id: inst.id }`
   - Obter `logId` do retorno `.select('id').single()`

2. No bloco `try` após upsert bem-sucedido:
   - UPDATE `{ status: 'success', finished_at: new Date().toISOString(), summary: { synced: 1, failed: 0 } }` WHERE id = logId

3. No bloco `catch`:
   - UPDATE `{ status: 'failed', finished_at: new Date().toISOString(), error_message: msg }` WHERE id = logId
   - Adicionar `summary: { synced: 0, failed: 1 }` para consistência

4. `triggered_by` = `trigger === 'cron' ? 'cron' : 'manual'` (trigger vem do body da request)

5. Verify: `supabase functions deploy donc-api-sync`

## Acceptance Criteria

- Edge function deploya sem erros
- Sync manual via `/configuracoes` > API DONC cria entradas em sync_service_log
- `triggered_by='manual'` para sync manual, `triggered_by='cron'` para agendado
- Em caso de falha: `status='failed'` + `error_message` preenchido
- Em caso de sucesso: `status='success'` + `summary.synced=1`

## Verification

- `supabase functions deploy donc-api-sync`
- Disparar sync manual e verificar `SELECT * FROM sync_service_log ORDER BY id DESC LIMIT 5`

## Idempotence and Recovery

- Safe to re-deploy: `supabase functions deploy donc-api-sync` sobrescreve
- Se deploy falhar: edge function antiga continua funcionando (sem logging)

## Exit Criteria

- [ ] Edge function deployada
- [ ] Logs gerados corretamente após sync
