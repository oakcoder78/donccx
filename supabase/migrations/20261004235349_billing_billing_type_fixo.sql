-- ============================================================================
-- Billing rebuild — Phase 2, fix: billing_type 'fixo' e as duas grafias
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §2.1
--
-- Dois achados da suite da Fase 2:
--
-- 1. O CHECK contract_series_billing_type_check so aceitava por_licenca e por_os,
--    entao a terceira base do SDD (§1.2) nao podia ser cadastrada. Estendido.
--
-- 2. O motor comparava billing_type = 'os', mas o banco guarda 'por_os' — a
--    mesma grafia que o engine antigo le. Sem isso, o Todimo (por_os) cairia no
--    ramo de licenca e a fatura sairia 310,73 em vez de 6.641,13. O motor passa
--    a aceitar as duas grafias.
--
-- O rename por_licenca -> licenca NAO acontece agora: o engine antigo
-- (_financeiro_series_month) le 'por_os' e 'por_licenca', e renomear quebraria
-- o cockpit vivo. A troca e item da Fase 7, quando o antigo morre. Ate la o
-- motor novo aceita as duas.
-- ============================================================================

ALTER TABLE public.contract_series
  DROP CONSTRAINT IF EXISTS contract_series_billing_type_check;

ALTER TABLE public.contract_series
  ADD CONSTRAINT contract_series_billing_type_check
  CHECK (billing_type = ANY (ARRAY['por_licenca','por_os','licenca','os','fixo']));
