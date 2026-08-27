-- Flag to control visibility of financial data (MRR/billing/licenças) without deploy
-- Presentation only (UI hide) — RLS still allows SELECT on mrr; true secrecy would need VIEW/RPC

INSERT INTO public.feature_flags (key, description, enabled, allowed_roles)
VALUES ('financial_data', 'Dados financeiros (MRR/billing/licenças)', true, ARRAY['admin','manager','finance'])
ON CONFLICT (key) DO NOTHING;
