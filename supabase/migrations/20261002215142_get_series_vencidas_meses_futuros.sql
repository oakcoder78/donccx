-- get_series_vencidas: return how many months are still materialized ahead of the
-- current month. The close dialog needs a real count to decide whether to offer
-- the "cancel future months" choice at all — months_overdue counts how far past
-- the renewal we are, which is not the same thing.
--
-- Return type changed, so the function must be dropped first (42P13).
DROP FUNCTION IF EXISTS public.get_series_vencidas();

CREATE OR REPLACE FUNCTION public.get_series_vencidas()
RETURNS TABLE(
  client_id int,
  client_name text,
  series_id uuid,
  series_label text,
  contract_start date,
  contract_renewal date,
  months_overdue int,
  last_launched_month text,
  meses_futuros int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.client_id,
    coalesce(cl.fantasy_name, cl.name),
    s.id,
    s.label,
    s.billing_start,
    s.contract_renewal,
    (extract(year FROM age(date_trunc('month', current_date), date_trunc('month', s.contract_renewal)))::int * 12
     + extract(month FROM age(date_trunc('month', current_date), date_trunc('month', s.contract_renewal)))::int),
    (SELECT max(c.ref_month)
     FROM public.contract_charges c
     WHERE c.series_id = s.id AND c.kind = 'recorrencia'),
    (SELECT count(*)::int
     FROM public.contract_charges c
     WHERE c.series_id = s.id AND c.kind = 'recorrencia'
       AND c.ref_month > to_char(current_date, 'YYYY-MM'))
  FROM public.contract_series s
  JOIN public.clients cl ON cl.id = s.client_id
  WHERE s.status = 'ativa'
    AND s.contract_months IS NOT NULL
    AND s.contract_renewal IS NOT NULL
    AND NOT coalesce(s.auto_renew, false)
    AND s.billing_end IS NULL
    AND s.contract_renewal < current_date
  ORDER BY s.contract_renewal;
$$;

REVOKE ALL ON FUNCTION public.get_series_vencidas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_series_vencidas() TO authenticated, service_role;