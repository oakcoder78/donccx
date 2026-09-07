# Phase 1: SQL Migration

## Objective

Criar migration SQL com feature flag + 3 Postgres RPCs.

## Scope

- Create: `supabase/migrations/YYYYMMDDHHMMSS_profissionais_cockpit.sql`
- Touch: nothing else

## Preconditions

- `client_usage.profissionais_versao` column exists (migration 20260726180000)
- `get_user_role()` function exists (migration 20260625160000)
- `feature_flags` table exists

## Tasks

1. Create migration file with timestamp
2. INSERT feature flag `profissionais_cockpit`
3. CREATE FUNCTION `get_profissionais_cockpit`
4. CREATE FUNCTION `get_profissionais_detalhe`
5. CREATE FUNCTION `get_profissionais_export`
6. Verify: `supabase db push --include-all`

## Acceptance Criteria

- 3 RPCs deploy sem erros
- Flag aparece em `feature_flags`
- RPC `get_profissionais_cockpit('2026-06')` retorna dados

## Verification

- `supabase db push --include-all`
- Testar RPC via Supabase dashboard ou REST API

## Exit Criteria

- [ ] Migration deployada
- [ ] RPCs funcionais e retornando dados corretos
