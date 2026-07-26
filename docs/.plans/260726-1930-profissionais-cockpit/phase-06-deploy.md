# Phase 6: Deploy & Verify

## Objective

Deployar migration, build, push, e testar em producao.

## Preconditions

- Phases 1-5 completas
- `npm run build` passa

## Tasks

1. `supabase db push --include-all`
2. `git add -A && git commit -m "..." && git push origin main`
3. Verificar Vercel deploy
4. Testar: https://donccx.vercel.app/profissionais-cockpit
5. Verificar: feature flag ativa em /configuracoes
6. Verificar: CSM ve apenas seus clientes

## Acceptance Criteria

- Deploy sem erros
- Pagina funcional em producao
- Flag gerenciável via SettingsFeatureFlags
- RLS funcional para CSM

## Verification

- `supabase db push --include-all`
- `npm run build`
- Acessar URL de producao
