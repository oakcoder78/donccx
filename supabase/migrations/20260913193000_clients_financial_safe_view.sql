-- Column-level protection for financial data on public.clients.
--
-- Row-level access to clients is intentionally global (clients_global_select,
-- 20260903000001) — any authenticated user can read every client row. Until
-- now the 9 financial columns (mrr, licencas, valor_lic, billing_type,
-- billing_base_value, billing_floor, correction_index, billing_status,
-- billing_suspended_until) were only hidden by frontend convention
-- (SAFE_CLIENT_COLS in useClients.js/useClient.js) — RLS itself never
-- restricted columns, so any authenticated client could request those
-- columns directly and get them regardless of role. See
-- docs/security/RLS-EMPRESAS-SERIES.md, which already flagged this gap.
--
-- This migration adds real, server-side enforcement: a view that nulls the
-- financial columns for roles without the `financial_data` feature flag.
-- The check reads the live feature_flags row (same source of truth the
-- frontend already uses via useFeatureFlags/isEnabled), so there is no
-- second, hardcoded role list to drift out of sync.

create or replace function public.has_financial_data_access()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.feature_flags ff
    where ff.key = 'financial_data'
      and ff.enabled = true
      and public.get_user_role() = any (ff.allowed_roles)
  )
$$;

grant execute on function public.has_financial_data_access() to authenticated;

-- security_invoker = true: the view runs with the CALLER's RLS on
-- public.clients (row visibility unchanged), not the view owner's. Only the
-- 9 financial columns get masked here.
create or replace view public.clients_safe
with (security_invoker = true) as
select
  id, name, cnpj, segment, csm_id, stage_id, stage_override, abc_class,
  contract_start, contract_renewal, delay_days, onb_start, golive,
  health_uso, health_suporte, health_relacionamento, health_financeiro, health_projeto, health_total,
  created_at, updated_at, fantasy_name, logo_url, contract_active, unidades_total, unidades_donc,
  segment_id, site, address_cep, address_street, address_number, address_complement,
  address_neighborhood, address_city, address_state, contract_signed_date, description,
  freshdesk_company_id, health_calculated_at, freshdesk_company_ids, csm_temperature,
  temperature_updated_at, temperature_note, lifecycle_stage, comercial_id, erp, ti_tipo,
  case when public.has_financial_data_access() then mrr else null end as mrr,
  case when public.has_financial_data_access() then licencas else null end as licencas,
  case when public.has_financial_data_access() then valor_lic else null end as valor_lic,
  case when public.has_financial_data_access() then billing_type else null end as billing_type,
  case when public.has_financial_data_access() then billing_base_value else null end as billing_base_value,
  case when public.has_financial_data_access() then billing_floor else null end as billing_floor,
  case when public.has_financial_data_access() then correction_index else null end as correction_index,
  case when public.has_financial_data_access() then billing_status else null end as billing_status,
  case when public.has_financial_data_access() then billing_suspended_until else null end as billing_suspended_until
from public.clients;

grant select on public.clients_safe to authenticated;

comment on view public.clients_safe is
  'Read-only view of public.clients with the 9 financial columns nulled out for roles without the financial_data feature flag. Reads/list queries should use this view; writes (insert/update) still go directly against public.clients.';
