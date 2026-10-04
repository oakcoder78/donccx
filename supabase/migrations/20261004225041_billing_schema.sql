-- ============================================================================
-- Billing rebuild — Phase 1, migration 1/3: schema
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §2
--
-- Cria o modelo novo AO LADO do antigo. Nada e dropado aqui: contract_charges
-- e billing_payments continuam vivas e o cockpit atual segue funcionando. O
-- retire e a Fase 7, com gate de zero referencias — quatro funcoes vivas
-- (_financeiro_series_month, get_financeiro_detalhe, get_financeiro_export,
-- get_series_vencidas) e oito arquivos do frontend ainda leem as antigas.
--
-- Modelo: regra != fatura. series_rules e o plano; invoices e o documento
-- emitido e imutavel; invoice_entries e o livro de lancamentos por VALOR
-- (pagamento / desconto / baixa / estorno), que e o que permite pagamento
-- parcial — o requisito que o modelo antigo nao suporta.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Role helpers — flag-driven, com fallback seguro
-- ---------------------------------------------------------------------------
-- O padrao antigo (20260916120000) fixava a lista de roles na policy. Aqui a
-- lista vem de feature_flags.allowed_roles, para que mudar quem acessa seja
-- configuracao em Settings e nao migration. Fallback para o conjunto atual se
-- a flag sumir, para nao trancar ninguem fora por um dado ausente.
--
-- service_role nao tem auth.uid(): get_user_role() devolve NULL e um guard de
-- papel rejeitaria o motor de emissao. Aceito explicitamente.

CREATE OR REPLACE FUNCTION public.billing_read_roles() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT allowed_roles FROM public.feature_flags WHERE key = 'financial_data'),
    ARRAY['admin','manager','finance']
  );
$$;

CREATE OR REPLACE FUNCTION public.billing_write_roles() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT allowed_roles FROM public.feature_flags WHERE key = 'financeiro_cockpit_write'),
    ARRAY['admin','manager','finance']
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_billing() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.role() = 'service_role'
      OR coalesce(public.get_user_role(), '') = ANY (public.billing_read_roles());
$$;

CREATE OR REPLACE FUNCTION public.can_write_billing() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.role() = 'service_role'
      OR coalesce(public.get_user_role(), '') = ANY (public.billing_write_roles());
$$;

REVOKE ALL ON FUNCTION public.billing_read_roles()  FROM public, anon;
REVOKE ALL ON FUNCTION public.billing_write_roles() FROM public, anon;
REVOKE ALL ON FUNCTION public.can_read_billing()    FROM public, anon;
REVOKE ALL ON FUNCTION public.can_write_billing()   FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_read_roles()  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_write_roles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_billing()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_billing()   TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) series_rules — o plano de recorrencia
-- ---------------------------------------------------------------------------
-- Extraido de contract_charges kind='recorrencia'. Faixas de month_index
-- contiguas cobrindo 1..N; month_to NULL = aberta (segue mes a mes).
-- mode='percent' e relativo a unit x piso (o exemplo do SDD: 12 meses a 50%).

CREATE TABLE IF NOT EXISTS public.series_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id  uuid NOT NULL REFERENCES public.contract_series(id) ON DELETE CASCADE,
  month_from smallint NOT NULL CHECK (month_from >= 1),
  month_to   smallint NULL CHECK (month_to IS NULL OR month_to >= month_from),
  mode       text NOT NULL CHECK (mode IN ('amount','percent')),
  amount     numeric(14,2) NULL CHECK (amount IS NULL OR amount >= 0),
  percent    numeric(7,4)  NULL CHECK (percent IS NULL OR (percent >= 0 AND percent <= 100)),
  created_by uuid NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT series_rules_mode_fields CHECK (
    (mode = 'amount'  AND amount  IS NOT NULL AND percent IS NULL) OR
    (mode = 'percent' AND percent IS NOT NULL AND amount  IS NULL)
  ),
  CONSTRAINT series_rules_window_uq UNIQUE (series_id, month_from)
);

CREATE INDEX IF NOT EXISTS series_rules_series_idx ON public.series_rules (series_id);

-- ---------------------------------------------------------------------------
-- 3) series_eventuals — eventuais previstos no contrato
-- ---------------------------------------------------------------------------
-- A implantacao de R$ 15.000 do Valdir Moveis mora aqui. Vira fatura na
-- competencia do vencimento de cada parcela.

CREATE TABLE IF NOT EXISTS public.series_eventuals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id      uuid NOT NULL REFERENCES public.contract_series(id) ON DELETE CASCADE,
  label          text NOT NULL CHECK (length(btrim(label)) > 0),
  total          numeric(14,2) NOT NULL CHECK (total > 0),
  installments   smallint NOT NULL CHECK (installments >= 1 AND installments <= 120),
  first_due_date date NOT NULL,
  created_by     uuid NULL REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS series_eventuals_series_idx ON public.series_eventuals (series_id);

-- ---------------------------------------------------------------------------
-- 4) invoices — a fatura
-- ---------------------------------------------------------------------------
-- Emitida e imutavel. As unicas mutacoes possiveis sao o ajuste de valor e o
-- cancelamento, ambos com motivo obrigatorio e auditoria — e ambos por RPC.
--
-- ON DELETE RESTRICT no cliente e na serie: documento financeiro sobrevive ao
-- cadastro. Apagar um cliente com fatura falha de proposito; o procedimento de
-- limpeza (fixture de teste) cancela/remove as faturas antes.

CREATE TABLE IF NOT EXISTS public.invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number              text UNIQUE NOT NULL,
  client_id           integer NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  series_id           uuid NULL REFERENCES public.contract_series(id) ON DELETE RESTRICT,
  kind                text NOT NULL CHECK (kind IN ('recorrencia','eventual','complemento')),
  competencia         text NOT NULL CHECK (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount              numeric(14,2) NOT NULL CHECK (amount >= 0),
  due_date            date NOT NULL,
  description         text NULL,
  installment_group   uuid NULL,
  installment_no      smallint NULL CHECK (installment_no IS NULL OR installment_no >= 1),
  installments_total  smallint NULL CHECK (installments_total IS NULL OR installments_total >= 1),
  status              text NOT NULL DEFAULT 'emitida' CHECK (status IN ('emitida','cancelada')),
  replaces_invoice_id uuid NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  nf_ref              text NULL,
  adjusted_from       numeric(14,2) NULL,
  adjust_reason       text NULL,
  adjusted_by         uuid NULL REFERENCES public.profiles(id),
  adjusted_at         timestamptz NULL,
  cancelled_by        uuid NULL REFERENCES public.profiles(id),
  cancelled_at        timestamptz NULL,
  cancel_reason       text NULL,
  issued_at           timestamptz NOT NULL DEFAULT now(),
  issued_by           uuid NULL REFERENCES public.profiles(id),
  CONSTRAINT invoices_installment_fields CHECK (
    (installment_group IS NULL AND installment_no IS NULL AND installments_total IS NULL) OR
    (installment_group IS NOT NULL AND installment_no IS NOT NULL AND installments_total IS NOT NULL)
  ),
  CONSTRAINT invoices_adjusted_fields CHECK (
    (adjusted_from IS NULL AND adjust_reason IS NULL AND adjusted_by IS NULL AND adjusted_at IS NULL) OR
    (adjusted_from IS NOT NULL AND adjust_reason IS NOT NULL AND adjusted_by IS NOT NULL AND adjusted_at IS NOT NULL)
  ),
  CONSTRAINT invoices_cancelled_fields CHECK (
    (cancelled_by IS NULL AND cancelled_at IS NULL AND cancel_reason IS NULL) OR
    (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)
  ),
  CONSTRAINT invoices_complemento_ref CHECK (kind <> 'complemento' OR replaces_invoice_id IS NOT NULL)
);

-- Uma recorrencia por (serie, competencia) — mas SO enquanto emitida. Cancelar
-- libera a competencia para a substituta.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_recurrence_uq
  ON public.invoices (series_id, competencia)
  WHERE kind = 'recorrencia' AND status = 'emitida';

-- Parcelas de um eventual: uma por (grupo, numero).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_eventual_inst_uq
  ON public.invoices (installment_group, installment_no)
  WHERE installment_group IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_client_comp_idx ON public.invoices (client_id, competencia DESC);
CREATE INDEX IF NOT EXISTS invoices_comp_idx        ON public.invoices (competencia);
CREATE INDEX IF NOT EXISTS invoices_series_idx      ON public.invoices (series_id);
CREATE INDEX IF NOT EXISTS invoices_due_open_idx    ON public.invoices (due_date) WHERE status = 'emitida';

-- ---------------------------------------------------------------------------
-- 5) invoice_entries — o livro de lancamentos
-- ---------------------------------------------------------------------------
-- Pagamento parcial e o requisito que justifica o rebuild. O estado da fatura
-- e derivado do saldo, nunca gravado.
--
-- Lancamentos sao imutaveis: nao ha UPDATE nem DELETE. Correcao e um estorno
-- que referencia o alvo. ON DELETE RESTRICT na fatura e no alvo — apagar um
-- lancamento destruiria a trilha que e a razao de existir do livro.

CREATE TABLE IF NOT EXISTS public.invoice_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  kind         text NOT NULL CHECK (kind IN ('pagamento','desconto','baixa','estorno')),
  amount       numeric(14,2) NOT NULL CHECK (amount > 0),
  happened_at  date NOT NULL,
  method       text NULL CHECK (method IS NULL OR method IN ('pix','boleto','transferencia','cartao','dinheiro','outro')),
  external_ref text NULL,
  note         text NULL,
  reason       text NULL,
  reverses_id  uuid NULL REFERENCES public.invoice_entries(id) ON DELETE RESTRICT,
  batch_id     uuid NULL,
  created_by   uuid NULL REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_entries_method_chk CHECK (kind <> 'pagamento' OR method IS NOT NULL),
  CONSTRAINT invoice_entries_reason_chk CHECK (
    kind NOT IN ('estorno','baixa') OR (reason IS NOT NULL AND length(btrim(reason)) >= 10)
  ),
  CONSTRAINT invoice_entries_reverses_chk CHECK ((kind = 'estorno') = (reverses_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS invoice_entries_invoice_idx ON public.invoice_entries (invoice_id) INCLUDE (kind, amount);
CREATE INDEX IF NOT EXISTS invoice_entries_batch_idx   ON public.invoice_entries (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_entries_reverses_idx ON public.invoice_entries (reverses_id) WHERE reverses_id IS NOT NULL;

-- Validacao do estorno: mesmo fatura, alvo nao-estorno, sem over-reversal.
-- A aritmetica do saldo depende disso — um estorno que aponta para outra fatura
-- ou que reverte duas vezes corrompe os totais em silencio.
CREATE OR REPLACE FUNCTION public.validate_invoice_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target   public.invoice_entries;
  v_reversed numeric;
BEGIN
  IF NEW.kind <> 'estorno' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_target FROM public.invoice_entries WHERE id = NEW.reverses_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'estorno: lancamento alvo nao encontrado' USING errcode = 'P0002';
  END IF;
  IF v_target.invoice_id <> NEW.invoice_id THEN
    RAISE EXCEPTION 'estorno: o alvo pertence a outra fatura' USING errcode = '23514';
  END IF;
  IF v_target.kind = 'estorno' THEN
    RAISE EXCEPTION 'estorno: nao se estorna um estorno' USING errcode = '23514';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_reversed
  FROM public.invoice_entries WHERE reverses_id = NEW.reverses_id;

  IF v_reversed + NEW.amount > v_target.amount THEN
    RAISE EXCEPTION 'estorno: excede o valor do lancamento original (R$ %)', v_target.amount
      USING errcode = '23514';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_invoice_entry ON public.invoice_entries;
CREATE TRIGGER trg_validate_invoice_entry
  BEFORE INSERT ON public.invoice_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_entry();

-- ---------------------------------------------------------------------------
-- 6) billing_run_log — observabilidade da emissao
-- ---------------------------------------------------------------------------
-- Sem isso, uma competencia que fecha parcialmente deixa clientes sem fatura
-- sem nenhum sinal. O log registra o que foi emitido, o que foi pulado e por
-- que, e o que deu erro.

CREATE TABLE IF NOT EXISTS public.billing_run_log (
  id          bigserial PRIMARY KEY,
  run_at      timestamptz NOT NULL DEFAULT now(),
  competencia text NOT NULL,
  series_id   uuid NULL REFERENCES public.contract_series(id) ON DELETE SET NULL,
  outcome     text NOT NULL CHECK (outcome IN ('emitida','pulada','erro')),
  reason      text NULL,
  invoice_id  uuid NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  detail      jsonb NULL
);

CREATE INDEX IF NOT EXISTS billing_run_log_comp_idx ON public.billing_run_log (competencia, run_at DESC);
CREATE INDEX IF NOT EXISTS billing_run_log_series_idx ON public.billing_run_log (series_id);

-- ---------------------------------------------------------------------------
-- 7) Numeracao
-- ---------------------------------------------------------------------------
-- Sequencia global, nao reiniciada por ano — unicidade sem coordenacao. O
-- prefixo de ano e informativo. Zero-padding para a ordem lexicografica bater
-- com a numerica.

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_year int DEFAULT NULL)
RETURNS text
LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'FAT-' || coalesce(p_year, extract(year from current_date)::int)::text
      || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
$$;

REVOKE ALL ON FUNCTION public.generate_invoice_number(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number(int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) contract_series — ancoras do vencimento
-- ---------------------------------------------------------------------------
-- first_competencia e a competencia do month_index 1; first_due_date e o
-- vencimento do month_index 1. Separados de billing_start para que "vence no
-- mes da competencia" e "vence no mes seguinte" convivam sem regra no codigo.
--
-- O trigger preenche os dois a partir de billing_start quando o chamador nao
-- informa — assim o form atual, que nao conhece as colunas, continua salvando.

ALTER TABLE public.contract_series
  ADD COLUMN IF NOT EXISTS first_competencia text,
  ADD COLUMN IF NOT EXISTS first_due_date    date;

UPDATE public.contract_series
SET first_competencia = coalesce(first_competencia, to_char(billing_start, 'YYYY-MM')),
    first_due_date    = coalesce(first_due_date, billing_start)
WHERE first_competencia IS NULL OR first_due_date IS NULL;

ALTER TABLE public.contract_series
  ALTER COLUMN first_competencia SET NOT NULL,
  ALTER COLUMN first_due_date    SET NOT NULL;

ALTER TABLE public.contract_series
  DROP CONSTRAINT IF EXISTS contract_series_first_competencia_chk;
ALTER TABLE public.contract_series
  ADD CONSTRAINT contract_series_first_competencia_chk
  CHECK (first_competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

CREATE OR REPLACE FUNCTION public.set_series_first_comp() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.first_competencia := coalesce(NEW.first_competencia, to_char(NEW.billing_start, 'YYYY-MM'));
  NEW.first_due_date    := coalesce(NEW.first_due_date, NEW.billing_start);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_series_first_comp ON public.contract_series;
CREATE TRIGGER trg_set_series_first_comp
  BEFORE INSERT OR UPDATE OF billing_start ON public.contract_series
  FOR EACH ROW EXECUTE FUNCTION public.set_series_first_comp();

-- ---------------------------------------------------------------------------
-- 9) RLS
-- ---------------------------------------------------------------------------
-- Leitura: flag financial_data. Escrita: so por RPC (SECURITY DEFINER, que
-- checa can_write_billing() internamente) — exceto series_rules e
-- series_eventuals, que o form do contrato edita direto, espelhando o padrao
-- de contract_series (policy series_write).
--
-- invoice_entries nao tem policy de UPDATE nem de DELETE: o livro e imutavel
-- por construcao, nao por convencao.

ALTER TABLE public.series_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_eventuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_run_log  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS series_rules_select ON public.series_rules;
CREATE POLICY series_rules_select ON public.series_rules
  FOR SELECT USING (public.can_read_billing());
DROP POLICY IF EXISTS series_rules_write ON public.series_rules;
CREATE POLICY series_rules_write ON public.series_rules
  FOR ALL USING (public.can_write_billing()) WITH CHECK (public.can_write_billing());

DROP POLICY IF EXISTS series_eventuals_select ON public.series_eventuals;
CREATE POLICY series_eventuals_select ON public.series_eventuals
  FOR SELECT USING (public.can_read_billing());
DROP POLICY IF EXISTS series_eventuals_write ON public.series_eventuals;
CREATE POLICY series_eventuals_write ON public.series_eventuals
  FOR ALL USING (public.can_write_billing()) WITH CHECK (public.can_write_billing());

DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT USING (public.can_read_billing());
-- Sem policy de INSERT/UPDATE/DELETE: escrita so via RPC.

DROP POLICY IF EXISTS invoice_entries_select ON public.invoice_entries;
CREATE POLICY invoice_entries_select ON public.invoice_entries
  FOR SELECT USING (public.can_read_billing());
-- Sem policy de INSERT/UPDATE/DELETE: escrita so via RPC, e o livro e imutavel.

DROP POLICY IF EXISTS billing_run_log_select ON public.billing_run_log;
CREATE POLICY billing_run_log_select ON public.billing_run_log
  FOR SELECT USING (public.can_read_billing());
-- INSERT so pelo motor (service_role bypassa RLS).

REVOKE ALL ON TABLE public.series_rules     FROM anon, public;
REVOKE ALL ON TABLE public.series_eventuals FROM anon, public;
REVOKE ALL ON TABLE public.invoices         FROM anon, public;
REVOKE ALL ON TABLE public.invoice_entries  FROM anon, public;
REVOKE ALL ON TABLE public.billing_run_log  FROM anon, public;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.series_rules     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.series_eventuals TO authenticated;
GRANT SELECT                          ON TABLE public.invoices         TO authenticated;
GRANT SELECT                          ON TABLE public.invoice_entries  TO authenticated;
GRANT SELECT                          ON TABLE public.billing_run_log  TO authenticated;
GRANT USAGE ON SEQUENCE public.invoice_number_seq TO authenticated, service_role;
