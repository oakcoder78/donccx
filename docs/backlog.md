# Backlog — doncCX Hub

> Catálogo de débitos técnicos, refactors pendentes e ideias de feature.
> Diferente de um SDD: aqui ficam itens **pré-priorização**. Itens que viram
> trabalho ativo saem do backlog e migram para um SDD dedicado em `docs/sdd/`.

## How to use

1. **New item:** copy the template at the bottom, assign the next ID (`TD-###` for Tech Debt / Refactor, `IDEA-###` for Ideas), add to "Open Items".
2. **Triaging:** bump Priority; mark `Status: Ready` when scope is clear and effort is estimated.
3. **Activating:** when work starts, create or link a SDD in `docs/sdd/` and set `Status: Active → docs/sdd/<name>-sdd.md`.
4. **Closing:** when shipped, move the entry to "Closed Items" with commit hash + date. Do not delete.
5. **Cancelling:** keep the entry in Open Items, set `Status: Cancelled` with a one-line reason.

## Summary

| ID | Type | Title | Priority | Status | Linked SDD |
|---|---|---|---|---|---|
| TD-001 | Tech Debt | Drop `clients.app_code` / `clients.url_donc` (backfill + drop columns) | M | Done | — |
| TD-002 | Tech Debt | Desativar legacy API keys e migrar frontend para `sb_publishable_*` | H | Ready | — |

## Open Items

### TD-002 — Desativar legacy API keys e migrar frontend para `sb_publishable_*`

**Type:** Tech Debt
**Priority:** H
**Status:** Ready
**Origin:** 2026-06-11 — auditoria de segurança após exposição da service_role JWT; Edge Functions e scripts já são compatíveis com `sb_secret_*` (helper `_shared/auth.ts`).
**Linked SDD:** —
**Related commits:** —

### Context

A service_role JWT exposta só morre de fato quando as legacy API keys forem desativadas no Dashboard. Pré-requisitos já entregues: funções usam `getServiceKey()` (lê `SUPABASE_SECRET_KEYS`), S2S usa `SYNC_WEBHOOK_SECRET`, scripts aceitam `SUPABASE_SECRET_KEY`. Falta o lado operacional.

### Proposed approach

1. Criar chaves novas no Dashboard (Settings → API Keys): `sb_publishable_*` e `sb_secret_*` (nome `default`).
2. Atualizar `VITE_SUPABASE_ANON_KEY` na Vercel e `.env.local` para o valor `sb_publishable_*` (supabase-js aceita sem mudança de código) e `SUPABASE_SECRET_KEY` local.
3. Confirmar que nada mais usa as chaves legadas (n8n já migrado para `x-webhook-secret`).
4. Desativar legacy keys no Dashboard (reversível) — isso revoga a service_role exposta sem invalidar sessões de usuários.

### Risks

- Desativar as legacy keys antes de trocar `VITE_SUPABASE_ANON_KEY` derruba o frontend — seguir a ordem acima.
- Deadline Supabase: chaves legadas deixam de funcionar no fim de 2026.

## Closed Items

### TD-001 — Drop `clients.app_code` / `clients.url_donc`

**Type:** Tech Debt
**Priority:** M
**Status:** Done
**Closed:** 2026-06-09 — migration `253b590`
**Origin:** 2026-06-03 — session where the instances list started reading `url_donc` / `app_code` from `client_donc_instances`; the matching columns on `clients` were soft-deprecated instead of dropped.
**Linked SDD:** —
**Related commits:** `4a8567b` (table added in instances list), `a9c36d2` (soft deprecation in form + display), `253b590` (backfill + drop migration)

### Context

As colunas `clients.app_code` e `clients.url_donc` ficaram órfãs: sem input no `ClientForm`, sem `InfoRow` no card navy de `ClientSubDados`, mas continuam existindo no banco e são escritas pela rota de upsert do form removido (via payload que também foi limpo — hoje o Supabase ignora chaves desconhecidas, mas o payload está semanticamente fora de sincronia com o schema).

A tabela canônica é `client_donc_instances`, que carrega esses campos por contrato SaaS desde a migration `020_donc_api_integration`.

### Approach

1. **Backfill:** copia `url_donc` e `app_code` de `clients` para `client_donc_instances` onde a instância ainda tem NULL. Nunca sobrescreve valores existentes.
2. **Drop columnas:** `ALTER TABLE clients DROP COLUMN app_code, DROP COLUMN url_donc;`
3. **Verificação:** build limpo, frontend sem regressão — tabela de instâncias em `/empresas/:id` continua exibindo URL e App Code.

### Files

- `supabase/migrations/20260603000000_drop_clients_appcode_urldonc.sql` — backfill + drop em um único arquivo.
- Sem mudanças de frontend (já removidas em `a9c36d2`).

### Risks

- **Interno:** zero readers dessas colunas em `src/`, `supabase/functions/` ou `scripts/`. Edge Functions e scripts não as referenciam.
- **Externo:** BI, exports ou integrações fora deste repositório que leiam `clients.app_code` / `clients.url_donc` quebrariam. Sem visibilidade aqui — registrar no log de deploy se houver essa dependência.
- **Dados:** backfill cobre apenas primeira instância por cliente sem valor. Se uma empresa tem múltiplas instâncias e só uma delas estava populada, o backfill não sobrescreve — conservador e desejado.

---

## Template — copy to add a new item

```markdown
## [ID] — [Short title]

**Type:** Tech Debt | Refactor | Idea
**Priority:** H | M | L
**Status:** Backlog | Ready | Active | Done | Cancelled
**Origin:** YYYY-MM-DD — short context
**Linked SDD:** —
**Related commits:** —

### Context
...

### Proposed approach
1. ...
2. ...
3. ...

### Files
- `path/to/file` (Create | Modify — what changes)

### Risks
- ...
```
