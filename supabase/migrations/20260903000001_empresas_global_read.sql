-- Empresas: listagem rica para todos — leitura global, escrita continua restrita
-- Antes: csm/sales viam só carteira (RLS). Agora: todos veem todos os cards (FOR SELECT USING true)
-- mas INSERT/UPDATE/DELETE continuam só para admin/manager/finance (policies existentes)
-- + Nova Empresa / Editar seguem gateados no frontend para sales/csm/analyst
-- Detalhe /empresas/:id só libera ?tab=overview para não-admin/manager (frontend gate)

-- Global read for any authenticated user (permissive OR — overrides carteira-scoped selects)
DROP POLICY IF EXISTS "clients_global_select" ON public.clients;
CREATE POLICY "clients_global_select"
  ON public.clients FOR SELECT TO authenticated USING (true);

-- Keep existing admin/manager/finance/analyst policies for backward compat (redundant now, but harmless)
-- and keep carteira-scoped policies for audit history (no DROP needed for csm/sales — they are now superset)

-- Optional: also allow global read on related tables that overview needs for non-owned rows
-- to avoid empty champions/usage in overview for sales viewing other carteira.
-- We keep these restrictive for now (overview will show health/contract from clients.* only);
-- if full overview data is desired, add similar global SELECTs for contact_links/client_support/client_usage
