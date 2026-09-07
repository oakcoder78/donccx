-- Eventuais com data cheia (DD/MM/AAAA) definida pelo usuário: due_date por parcela
-- month_index/ref_month passam a derivar da data (fim do rebate no date picker)

ALTER TABLE public.contract_charges ADD COLUMN IF NOT EXISTS due_date date;

-- Backfill: dia do vencimento da série aplicado à competência (clamp no fim do mês)
UPDATE public.contract_charges ch SET due_date = least(
  ((ch.ref_month || '-01')::date + (COALESCE(s.due_day, 1) - 1) * make_interval(days => 1)),
  ((ch.ref_month || '-01')::date + make_interval(months => 1) - make_interval(days => 1))
)::date
FROM public.contract_series s
WHERE s.id = ch.series_id AND ch.due_date IS NULL AND ch.ref_month IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_charges_due_date ON public.contract_charges(series_id, due_date);
