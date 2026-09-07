# Mapa do legado

> Status: vivo. O que foi aposentado, quando, onde está agora e qual doc conta a história.

| Aposentado | Quando | Onde está agora | História em |
|---|---|---|---|
| `ClientForm.jsx` (modal legado) | 2026-09-07 (`aa87554`) | `ClientFormContent.jsx` + rotas `/empresas/nova`, `/empresas/:id/editar` | `backlog.md` TD-009, `sdd/empresas-form-v2-sdd.md` adendo 1.1 |
| Gate `empresas_form_v2` (flag) | 2026-09-07 (`aa87554`) | V2 sem gate (`ClientFormPage.jsx`) | `CHANGELOG-2026-09.md` |
| `labs_dashboard` (flag) | 2026-08-29 (migration `20260829000000`) | `dashboard_v3` (kill-switch) | `sdd/labs-dashboard-sdd.md`, `backlog.md` IDEA-002 |
| Dashboard monolito em `/dashboard` | 2026-08-30 | `/labs/dashboard` (`AdminOnlyRoute`) | `sdd/labs-dashboard-sdd.md` |
| Régua única de contrato (`month_index` sem série) | 2026-09-07 (`3df4f0f`) | `contract_series` + charges com `series_id/ref_month/due_date` | `modules/clients.md`, `CHANGELOG-2026-09.md` |
| `billing_payments` PK `(client, month)` | 2026-09-07 (`3df4f0f`) | PK `(client, series, month)` — 2 faturas no mês | `security/RLS-EMPRESAS-SERIES.md` |
| Gate de presença de produtos | 2026-09-07 (`aa87554`) | Produto sempre opcional | `modules/clients.md`, `CHANGELOG-2026-09.md` |
| Legacy API keys (JWT anon/service_role) | 2026-06-11 | `sb_publishable_*` / `sb_secret_*` | `backlog.md` TD-002 |
| `clients.app_code` / `url_donc` | 2026-06-09 (`253b590`) | `client_donc_instances` | `backlog.md` TD-001 |
| Filtragem de `/empresas` por carteira | 2026-09-07 (`e99ade1`) | Leitura global (`clients_global_select`) | `security/RLS-EMPRESAS-SERIES.md` |
| `contract_charges` sem data (`month_index` puro) | 2026-09-07 (`afb5330`) | `due_date` por parcela | `modules/clients.md`, `CHANGELOG-2026-09.md` |
