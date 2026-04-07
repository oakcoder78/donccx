-- ============================================================
-- 009 — health_rules v2: modelo base 20 com modificadores
-- Execute no Supabase SQL Editor
-- ============================================================

DELETE FROM health_rules;

INSERT INTO health_rules (dimension, label, rule_key, points) VALUES
('uso', 'OS crescendo >35%',                                    'os_up',        3),
('uso', 'OS estável ±35%',                                      'os_stable',    0),
('uso', 'OS caindo >35%',                                       'os_down',     -8),
('uso', 'Usuários crescendo >35%',                              'usr_up',       3),
('uso', 'Usuários estáveis ±35%',                               'usr_stable',   0),
('uso', 'Usuários caindo >35%',                                 'usr_down',    -8),
('uso', 'Módulo implantado no mês',                             'mod_new',      2),
('uso', 'Módulo abandonado no mês',                             'mod_abandoned',-4),
('suporte', '0 tickets',                                        't0',           0),
('suporte', '1-15 tickets, resolução 90%+',                     't15_ok',       0),
('suporte', '1-15 tickets, resolução <90%',                     't15_nok',     -5),
('suporte', 'Tickets >15, resolução 90%+',                      'thi_ok',      -3),
('suporte', 'Tickets >15, resolução <90%',                      'thi_nok',    -10),
('suporte', 'SLA primeira resposta ≤15 min',                    'sla_ok',       0),
('suporte', 'SLA primeira resposta >15 min',                    'sla_nok',     -5),
('relacionamento', 'Sem decisor — mês 1',                       'nd_m1',       -5),
('relacionamento', 'Sem decisor — mês 2',                       'nd_m2',       -8),
('relacionamento', 'Sem decisor — mês 3+',                      'nd_m3',      -12),
('relacionamento', 'Sem champion',                              'no_champ',    -5),
('relacionamento', 'Engajamento baixo',                         'eng_low',     -5),
('relacionamento', 'Engajamento médio',                         'eng_mid',     -2),
('relacionamento', 'Engajamento alto',                          'eng_high',     0),
('financeiro', 'Em dia',                                        'fin_ok',       0),
('financeiro', 'Atraso até 30 dias',                            'fin_30',      -7),
('financeiro', 'Atraso 31-60 dias',                             'fin_60',      -13),
('financeiro', 'Atraso 60+ dias',                               'fin_90',      -20),
('projeto', 'Sem projetos ativos',                              'no_proj',      0),
('projeto', 'Milestones no prazo',                              'mp_ok',        0),
('projeto', 'Milestone atrasado',                               'mp_late',     -5),
('projeto', 'Onboarding não concluído após 90 dias do go live', 'ob_late',    -10);
