# Phase 4: Deploy

## Objective

Deployar migration, edge function, e frontend em produção.

## Preconditions

- Phase 1-3 completas
- `npm run build` passa

## Tasks

1. `supabase db push --include-all`
2. `supabase functions deploy donc-api-sync`
3. `git add -A && git commit -m "..." && git push origin main`
4. Verificar Vercel deploy
5. Testar: https://donccx.vercel.app/profissionais-cockpit
6. Disparar sync manual via /configuracoes > API DONC
7. Verificar `sync_service_log` populado com `triggered_by='manual'`
8. Verificar cockpit exibe timestamp

## Acceptance Criteria

- Deploy sem erros
- Sync manual gera entradas corretas
- Cockpit exibe timestamp
- RLS funcional (SELECT ok, INSERT rejeitado para authenticated)

## Verification

- `supabase db push --include-all`
- `supabase functions deploy donc-api-sync`
- `npm run build`
- Acessar URL de produção e testar

## Idempotence and Recovery

- Migration usa CREATE TABLE (não destrutivo)
- Edge function deploy sobrescreve versão anterior
- Se algo falhar: rollback manual (reverter commit + redeploy edge function anterior)

## Exit Criteria

- [ ] Tudo deployado e funcional em produção
