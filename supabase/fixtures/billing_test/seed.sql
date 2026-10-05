-- ============================================================================
-- Fixture de teste do cockpit de faturamento (Fase 4), dados ficticios.
-- Cria 3 clientes "[TESTE] ..." com series, regras, uso e um eventual parcelado.
-- NAO cria faturas: o fechamento de competencia e feito pela tela (ou pelo roteiro).
--
-- Rodar:    supabase db query --linked -f supabase/fixtures/billing_test/seed.sql
-- Limpar:   supabase db query --linked -f supabase/fixtures/billing_test/teardown.sql
--
-- Restricao: a flag cockpit_faturamento fica restrita a admin enquanto o fixture
-- existir. Os clientes ficam em lifecycle_stage='cliente' (o motor so fatura esse
-- estagio), entao a pagina atual os mostra a quem tem acesso financeiro.
-- ============================================================================

DO $$
DECLARE
  v_alfa integer; v_beta integer; v_gama integer;
  v_sa uuid; v_sb uuid; v_sg uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.clients WHERE name LIKE '[TESTE] %') THEN
    RAISE EXCEPTION 'fixture ja existe: rode teardown.sql antes de criar outro';
  END IF;

  INSERT INTO public.clients (name, fantasy_name, lifecycle_stage, billing_status, billing_type)
  VALUES ('[TESTE] Alfa Ltda', '[TESTE] Alfa', 'cliente', 'ativo', 'por_licenca') RETURNING id INTO v_alfa;
  INSERT INTO public.clients (name, fantasy_name, lifecycle_stage, billing_status, billing_type)
  VALUES ('[TESTE] Beta Ltda', '[TESTE] Beta', 'cliente', 'ativo', 'por_licenca') RETURNING id INTO v_beta;
  INSERT INTO public.clients (name, fantasy_name, lifecycle_stage, billing_status, billing_type)
  VALUES ('[TESTE] Gama Ltda', '[TESTE] Gama', 'cliente', 'ativo', 'por_licenca') RETURNING id INTO v_gama;

  -- Alfa: 5 profissionais ativos em 2026-09, snapshot completo
  INSERT INTO public.client_usage (client_id, ref_month, profissionais_versao, pending)
  VALUES (v_alfa, '2026-09', '[{"ativo":true},{"ativo":true},{"ativo":true},{"ativo":true},{"ativo":true}]'::jsonb, false);

  INSERT INTO public.contract_series (client_id, kind, label, billing_start, first_competencia, first_due_date,
                                      usage_driven, billing_type, billing_base_value, billing_floor, status)
  VALUES (v_alfa, 'original', '[TESTE] contrato Alfa', '2026-01-01', '2026-01', '2026-01-10',
          true, 'por_licenca', 50, 2, 'ativa') RETURNING id INTO v_sa;
  INSERT INTO public.contract_series (client_id, kind, label, billing_start, first_competencia, first_due_date,
                                      usage_driven, billing_type, billing_base_value, billing_floor, status)
  VALUES (v_beta, 'original', '[TESTE] contrato Beta', '2026-01-01', '2026-01', '2026-01-10',
          false, 'fixo', 0, 0, 'ativa') RETURNING id INTO v_sb;
  INSERT INTO public.contract_series (client_id, kind, label, billing_start, first_competencia, first_due_date,
                                      usage_driven, billing_type, billing_base_value, billing_floor, status)
  VALUES (v_gama, 'original', '[TESTE] contrato Gama', '2026-01-01', '2026-01', '2026-01-10',
          false, 'fixo', 0, 0, 'ativa') RETURNING id INTO v_sg;

  -- Alfa: 100 + excedente (5 - piso 2) x 50 = 250 em 2026-09.
  -- Beta: 300 fixo. Gama: SEM regra, de proposito (aparece como sem_regra).
  INSERT INTO public.series_rules (series_id, month_from, month_to, mode, amount)
  VALUES (v_sa, 1, NULL, 'amount', 100), (v_sb, 1, NULL, 'amount', 300);

  -- Beta: implantacao parcelada, 3 x 300; a parcela 1 cai em 2026-09
  INSERT INTO public.series_eventuals (series_id, label, total, installments, first_due_date)
  VALUES (v_sb, '[TESTE] implantacao', 900, 3, '2026-09-05');

  RAISE NOTICE 'fixture criado: Alfa=%, Beta=%, Gama=%', v_alfa, v_beta, v_gama;
END $$;
