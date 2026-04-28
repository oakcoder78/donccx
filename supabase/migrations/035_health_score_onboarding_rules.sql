-- ============================================================
-- 035 — Novas regras de Health Score para dimensão Projeto
-- Substitui tarefa_atrasada (legada/morta) por regras baseadas
-- no novo módulo de onboarding.
-- ============================================================

-- ── 1. Remove regra legada tarefa_atrasada ───────────────────
-- Era baseada em milestone_tasks que foi dropada na 034

UPDATE public.health_rules
SET
  label  = 'Onboarding travado (pendência bloqueadora ativa)',
  points = -8
WHERE rule_key = 'tarefa_atrasada'
  AND dimension = 'projeto';

-- ── 2. Adiciona novas regras ──────────────────────────────────

INSERT INTO public.health_rules (rule_key, label, points, dimension)
VALUES
  ('onb_travado',           'Onboarding travado (pendência bloqueadora ativa)',    -8, 'projeto'),
  ('onb_atencao',           'Onboarding em atenção (prazo ou pendência crítica)',  -4, 'projeto'),
  ('onb_atividade_vencida', 'Atividade de onboarding com prazo vencido',           -3, 'projeto')
ON CONFLICT (rule_key) DO UPDATE
  SET label  = EXCLUDED.label,
      points = EXCLUDED.points;

-- ── 3. Remove regra tarefa_atrasada se ainda existir separada ─

DELETE FROM public.health_rules
WHERE rule_key = 'tarefa_atrasada'
  AND dimension = 'projeto';
