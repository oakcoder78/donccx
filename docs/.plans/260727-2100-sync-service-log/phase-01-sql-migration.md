# Phase 1: SQL Migration

## Objective

Criar tabela `sync_service_log` com índices e RLS.

## Scope

- Create: `supabase/migrations/20260727XXXXXX_create_sync_service_log.sql`

## Preconditions

- `client_donc_instances` table exists (FK target)
- `sync_log` table exists (reference for IDENTITY + RLS pattern)

## Tasks

1. Create migration file with timestamp
2. CREATE TABLE with all columns, CHECK constraints, FK ON DELETE SET NULL
3. CREATE INDEX idx_sync_service_lookup (service_name, ref_month, status)
4. CREATE INDEX idx_sync_service_latest (service_name, started_at DESC)
5. CREATE INDEX idx_sync_service_stuck (status, started_at) WHERE status = 'running'
6. ALTER TABLE ENABLE ROW LEVEL SECURITY
7. CREATE POLICY select_authenticated (SELECT TO authenticated)
8. CREATE POLICY insert_service_role (INSERT TO service_role)
9. CREATE POLICY update_service_role (UPDATE TO service_role)
10. Verify: `supabase db push --include-all`

## Acceptance Criteria

- Migration aplica sem erros
- Tabela criada com 3 índices visíveis em `\d sync_service_log`
- RLS ativo: `authenticated` faz SELECT, `anon` recebe erro

## Verification

- `supabase db push --include-all`
- Test SELECT via REST API (service key)
- Test INSERT via REST API (anon key → deve falhar)

## Idempotence and Recovery

- Safe to re-run: migration has no DROP, only CREATE
- Recovery if interrupted: `supabase migration repair --status reverted` + re-push

## Exit Criteria

- [ ] Tabela sync_service_log criada
- [ ] 3 índices criados
- [ ] RLS policies ativas
