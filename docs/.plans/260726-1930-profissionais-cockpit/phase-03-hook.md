# Phase 3: Hook

## Objective

Criar `useProfissionaisCockpit.js` com queries para meses disponiveis e dados principais.

## Scope

- Create: `src/hooks/useProfissionaisCockpit.js`

## Preconditions

- Phase 1 complete (RPCs existem)

## Tasks

1. Create hook file
2. Query 1: `SELECT DISTINCT ref_month FROM client_usage WHERE profissionais_versao IS NOT NULL ORDER BY ref_month DESC` (popula dropdown)
3. Query 2: `supabase.rpc('get_profissionais_cockpit', { p_ref_month: refMonth })`
4. Export `{ months, cockpitData, isLoading, error }`
5. Verify: `npm run build`

## Acceptance Criteria

- Hook exporta months, cockpitData, isLoading, error
- Build sem erros

## Verification

- `npm run build`
