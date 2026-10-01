-- RPC: active series whose signed term has run out and that nobody has decided
-- about yet. A series is "expired" when it is active, has a contract duration,
-- is NOT rolling month to month (auto_renew / billing_end IS NULL), and its
-- contract_renewal is in the past.
--
-- Before this, such a series just went quiet: it stopped being launched, so it
-- disappeared from the cockpit with no signal. The decision the Financeiro has
-- to make — keep rolling, create a new series, or close it — had no surface.
--
-- auto_renew series are excluded on purpose: rolling is a decision that was
-- already taken, and their contract_renewal is the date the ORIGINAL term ended
-- (a useful reference, not a pending action).
--
-- Feature flag in the same migration: lifecycle actions (close series / start
-- month-to-month rolling), starting with the same four roles that can already
-- write the series, so behaviour is unchanged today and Financeiro can restrict
-- it later without a deploy.
CREATE OR REPLACE FUNCTION public.get_series_vencidas()
RETURNS TABLE(
  client_id int,
  client_name text,
  series_id uuid,
  series_label text,
  contract_start date,
  contract_renewal date,
  months_overdue int,
  last_launched_month text
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
     WHERE c.series_id = s.id AND c.kind = 'recorrencia')
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

INSERT INTO public.feature_flags (key, enabled, allowed_roles, description)
VALUES (
  'contract_series_lifecycle',
  true,
  ARRAY['admin','manager','finance','sales']::text[],
  'Ciclo de vida da série — encerrar série e ativar renovação automática'
)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description;
