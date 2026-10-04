-- ============================================================================
-- Billing rebuild — Phase 1, hardening 2: privilegios de tabela e sequencia
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §2.10
--
-- Achado da validacao do hardening anterior. O billing_schema revogou de `anon`
-- e `public`, mas NAO de `authenticated` — e o Supabase concede ALL por padrao
-- em tabela nova. O `GRANT SELECT` que veio depois nao remove o resto.
--
-- Resultado: `authenticated` tinha SIUD em invoices, invoice_entries e
-- billing_run_log. O RLS bloqueia hoje (so existem policies de SELECT e a RLS
-- nao esta forcada), entao nao era exploravel — mas contradizia a spec ("so por
-- RPC") e era a mesma classe de risco latente da view invoice_balance: invisivel
-- agora, real no dia em que alguem adicionar uma policy permissiva.
--
-- A sequencia tambem: `authenticated` tinha USAGE, o que permite
-- `nextval('invoice_number_seq')` direto e queima numero de fatura sem emitir
-- nada. O emissor roda como SECURITY DEFINER, entao nao depende desse grant.
--
-- series_rules e series_eventuals MANTEM escrita direta: o form do contrato as
-- edita, espelhando a policy series_write de contract_series.
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE ON TABLE public.invoices        FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.invoice_entries FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.billing_run_log FROM authenticated;

REVOKE USAGE ON SEQUENCE public.invoice_number_seq FROM authenticated;
