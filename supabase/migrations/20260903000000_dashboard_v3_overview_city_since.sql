-- Enrich get_dashboard_clients_overview for Mapa drawer: city + cliente desde
-- Non-sensitive, same whole-base scope; no mrr/billing.
DROP FUNCTION IF EXISTS public.get_dashboard_clients_overview();
CREATE OR REPLACE FUNCTION public.get_dashboard_clients_overview()
RETURNS TABLE (
  id int, name text, fantasy_name text,
  address_state text, address_city text,
  health_total int, health_uso int, health_suporte int,
  health_relacionamento int, health_financeiro int, health_projeto int,
  csm_temperature int, temperature_updated_at timestamptz,
  csm_id uuid, comercial_id uuid,
  contract_start date, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, fantasy_name,
    address_state, address_city,
    health_total, health_uso, health_suporte,
    health_relacionamento, health_financeiro, health_projeto,
    csm_temperature, temperature_updated_at,
    csm_id, comercial_id,
    contract_start, created_at
  FROM public.clients
  WHERE lifecycle_stage = 'cliente' AND contract_active = true
  ORDER BY coalesce(fantasy_name, name);
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_clients_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_clients_overview() TO authenticated;
