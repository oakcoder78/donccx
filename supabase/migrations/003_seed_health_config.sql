-- Garante que exista ao menos uma linha em health_config
INSERT INTO health_config (threshold_healthy, threshold_attention)
VALUES (75, 50)
ON CONFLICT DO NOTHING;
