# RLS — Empresas (leitura global) + Séries contratuais

Estado em produção em 2026-09-07. Cada policy abaixo informa a migration de origem e a motivação. Helper central: `public.get_user_role()` (`SECURITY DEFINER`, lê `profiles.role` — nunca `auth.jwt()->>'role'`).

## `public.clients` — leitura global, escrita por papel

| Policy | Cmd | Regra | Origem | Motivo |
|---|---|---|---|---|
| `clients_global_select` | SELECT | `USING (true)` p/ `authenticated` | `20260903000001_empresas_global_read` | Listagem rica p/ todos (Opção A); `baseFilters` sem carteira |
| `clients_admin_all` | ALL | `admin/manager` | base Phase 1 | Gestão total |
| `clients_finance_insert/update` | INSERT/UPDATE | `finance` | `20260824000004` | Finance edita empresas |
| `clients_sales_insert/update` | INSERT/UPDATE | `sales` + `WITH CHECK (comercial_id = auth.uid() OR csm_id = auth.uid())` | `20260903000002_sales_empresas_write` | Sales cria/edita só a carteira |
| `clients_csm_select`, `clients_sales_select`, `clients_analyst_select`, `clients_finance_select` | SELECT | carteira / global por papel | Phase 1–2 | Redundantes após o global (permissivas fazem OR); mantidas por compatibilidade |

Sem `DELETE` fora de `admin/manager`. Enforcement real é o banco; o frontend apenas esconde CTAs (`+ Nova Empresa`/`Editar` só `admin/manager/finance` + sales na carteira).

## Financeiro blindado no Network

Papéis sem `financial_data` (`sales/csm/analyst`) recebem `SELECT` explícito sem `mrr/licencas/valor_lic/billing_type/billing_base_value/billing_floor/correction_index/billing_status/billing_suspended_until` (`SAFE_CLIENT_COLS` em `useClients.js`/`useClient.js`) — o dado não vaza nem no DevTools. `admin/manager/finance` seguem com `*`.

## `contract_series` / `contract_charges` / `billing_payments`

Espelham o padrão restritivo (leitura `admin/manager/finance/sales/csm`, **sem** `USING (true)` — decisão consciente: financeiro por série não é global como `clients`):

- `series_select` / `charges_select` (`20260902000003` + `20260907000001`): `get_user_role() IN ('admin','manager','finance','sales','csm')`.
- `series_write` / `charges_write`: `admin/finance/sales` (blanket — buraco conhecido: sales edita charges de qualquer cliente, mas só edita `clients` da carteira; não replicar sem notar).
- `billing_payments_select`: mesmos 5 papéis; `billing_payments_write`: só `admin/finance` (`20260902000004`).
- `billing_os_tiers`: `os_tiers_select` (5 papéis) / `os_tiers_write` (`admin/finance/sales`).
- `REVOKE ALL ... FROM anon, public` + `GRANT ... TO authenticated` em todas (padrão das migrations).
- Consistência: trigger `trg_check_charge_series_client` rejeita `charges.client_id` divergente da série; `series_write` valida `reason` de renegociação (CHECK NULL-safe).

## Auditoria

Transições de série via `audit_logs` (`logAction('create_series'/'encerrar_serie', 'contract_series', …)`); séries encerradas imutáveis (form read-only).
