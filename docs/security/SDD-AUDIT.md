# SDD — Sistema de Auditoria (Audit Logs)

## 1. Contexto

O sistema de auditoria registra ações dos usuários na tabela `public.audit_logs`.
Atualmente cobre 31 ações (26 base + 5 Freshdesk) distribuídas entre clients,
users, onboarding, projetos, questionários e Freshdesk Operations Center
(mapping + pending approvals). É acessível via `/configuracoes` → Auditoria
(roteada por `AdminRoute` + feature flag `logs`).

## 2. Arquitetura Atual

```
Frontend (React):
  useAuditLog() hook → supabase.from('audit_logs').insert({...})

  SettingsLogs.jsx:
    useQuery(['audit_logs', ...]) → supabase.from('audit_logs')
      .select('*').order('created_at', false).limit(200)

Banco (Postgres):
  audit_logs (id, user_id, user_name, action, entity_type, entity_id,
              entity_name, old_value, new_value, created_at)
  RLS: audit_logs_insert → FOR INSERT TO authenticated WITH CHECK (true)
       audit_logs_select → FOR SELECT TO authenticated USING (true)

  Contrato canônico: toda escrita usa `old_value`/`new_value` (JSONB). A coluna
  `details` não existe no schema — inserts com `details` falham silenciosamente
  (best-effort catch). Hook de referência: `src/hooks/useAuditLog.js:logAction`
  insere `old_value`/`new_value`.

  Ações Freshdesk auditadas (fix `2ad42aa` — `details` → `old_value`/`new_value`):
  - `src/components/settings/SettingsFreshdesk.jsx` — `freshdesk_mapping_saved`
    (`old_value: before`, `new_value: { after, evidence }`) e
    `freshdesk_blocked_resolved` (`old_value: before`, `new_value: { freshdesk_company_id, freshdesk_company_ids, kept_id }`)
  - `src/pages/FreshdeskPendingPage.jsx:logAudit` — `freshdesk_approved`,
    `freshdesk_merged`, `freshdesk_rejected` (`old_value: { client_id, ref_month }`, `new_value: details`)
```

## 3. Aderência vs Gaps

### ✅ Aderente

| Requisito | Status |
|-----------|--------|
| Schema completo (snapshots old/new) | ✅ |
| 26 ações base + 5 Freshdesk (mapping/pending) trackeadas | ✅ |
| INSERT acessível a qualquer authenticated user | ✅ |
| Feature flag controlando visibilidade do menu | ✅ |
| Filtros por entidade + data | ✅ |
| Acesso admin/manager via AdminRoute | ✅ |
| Freshdesk mapping/pending usam `old_value`/`new_value` (sem `details`) | ✅ |

### ❌ Gaps

| # | Gap | Severidade | Fase |
|---|-----|------------|------|
| G1 | RLS `audit_logs_select` aberto (`true`) — analyst vê logs de todos | 🔴 Alta | 1 |
| G2 | `useProjects.js` faz INSERT sem `user_id`/`user_name` | 🔴 Alta | 1 |
| G3 | Flag `logs` não existe no banco — menu oculto | 🟡 Média | 1 |
| G4 | Limite fixo de 200 registros sem paginação | 🟡 Média | 2 |
| G5 | 9 módulos sem auditoria (activities, contacts, feature flags, etc.) — Freshdesk mapping/pending já coberto em `2ad42aa` | 🟡 Média | 2 |
| G6 | Sem tracking de login/logout | 🟢 Baixa | 3 |
| G7 | Sem busca textual nos logs | 🟢 Baixa | 3 |
| G8 | Sem export CSV | 🟢 Baixa | 3 |

## 4. Plano de Correções

### Fase 1 — Crítico (esta sprint)

| Item | Arquivos | Esforço |
|------|----------|---------|
| G1 — RLS role-based | `supabase/migrations/20260625170000_fix_audit_rls.sql` | 1h |
| G2 — Fix useProjects.js | `src/hooks/useProjects.js` | 30min |
| G3 — Seed flag `logs` | `supabase/migrations/20260625170000_fix_audit_rls.sql` (mesmo arquivo) | 15min |

### Fase 2 — Cobertura (próxima sprint)

| Item | Esforço |
|------|---------|
| G5a — Audit activities CRUD | 2h |
| G5b — Audit contacts CRUD | 1h |
| G5c — Audit feature flag toggles | 1h |
| G5d — Audit health score recalc | 30min |
| G5e — Audit stages/segments/catalog | 1h |
| G5f — Audit project templates CRUD | 1h |
| G4 — Paginação cursor-based | 3h |

### Fase 3 — UX (backlog)

| Item | Esforço |
|------|---------|
| G6 — Login/logout tracking (onAuthStateChange) | 2h |
| G7 — Busca textual | 2h |
| G8 — Export CSV | 2h |

## 5. Decisões Técnicas

### RLS Policy Design

```sql
-- Admin/manager: veem todos os logs
-- CSM: veem logs onde user_id = auth.uid() OU entity_type/client vinculado
--      (via subquery clients.csm_id)
-- Analyst: veem apenas próprios logs (user_id = auth.uid())
-- INSERT: qualquer authenticated pode inserir (igual hoje)
```

### Feature Flag

A flag `logs` permite desabilitar o menu de auditoria sem alterar código.
Inserida via migration com `enabled_by_default = true` para já nascer ativa.

### Paginação (Fase 2)

Trocar `LIMIT 200` por cursor-based pagination usando `created_at` como cursor.
Frontend: botão "Carregar mais" no lugar de scroll infinito.

## 6. Security Testing Tooling (Backlog)

Avaliar e integrar ferramentas automatizadas de segurança:

| Ferramenta | Tipo | Objetivo |
|------------|------|----------|
| Semgrep | SAST | Escanear código por padrões inseguros (XSS, SQLi, hardcoded secrets) |
| npm audit | SCA | Identificar CVEs em dependências |
| OWASP ZAP | DAST | Escanear app em execução (XSS, CSRF, headers, clickjacking) |
| trufflehog / gitleaks | Secret scan | Varrer git history por credenciais vazadas |
| Supabase Database Advisor | Infra scan | Recomendações de segurança/performance no Dashboard |

**Critério de aceite:** pipeline CI executa SAST + SCA a cada push; DAST semanal; secret scan no pre-commit hook.
