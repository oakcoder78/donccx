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
| TD-001 | Tech Debt | Drop `clients.app_code` / `clients.url_donc` (backfill + drop columns) | M | Backlog | — |

## TD-001 — Drop `clients.app_code` / `clients.url_donc`

**Type:** Tech Debt
**Priority:** M
**Status:** Backlog
**Origin:** 2026-06-03 — session where the instances list started reading `url_donc` / `app_code` from `client_donc_instances`; the matching columns on `clients` were soft-deprecated instead of dropped.
**Linked SDD:** —
**Related commits:** `4a8567b` (table added in instances list), `a9c36d2` (soft deprecation in form + display)

### Context

As colunas `clients.app_code` e `clients.url_donc` ficaram órfãs: sem input no `ClientForm`, sem `InfoRow` no card navy de `ClientSubDados`, mas continuam existindo no banco e são escritas pela rota de upsert do form removido (via payload que também foi limpo — hoje o Supabase ignora chaves desconhecidas, mas o payload está semanticamente fora de sincronia com o schema).

A tabela canônica é `client_donc_instances`, que carrega esses campos por contrato SaaS desde a migration `020_donc_api_integration`.

### Proposed approach

1. **Backfill na migration nova:**
   ```sql
   UPDATE client_donc_instances i
     SET url_donc = c.url_donc,
         app_code = c.app_code
   FROM clients c
   WHERE i.client_id = c.id
     AND (i.url_donc IS NULL OR i.app_code IS NULL);
   ```
2. **Drop das colunas:**
   ```sql
   ALTER TABLE clients DROP COLUMN app_code, DROP COLUMN url_donc;
   ```
3. **Smoke test:** `npm run build` + abrir `/empresas/22?tab=operacional` e confirmar que a tabela de instâncias continua exibindo URL e App Code sem regressão.

### Files

- `supabase/migrations/<timestamp>_drop_clients_appcode_urldonc.sql` (new) — backfill + drop em um único arquivo.
- Sem mudanças de frontend (já foram removidas em `a9c36d2`).

### Risks

- **Interno:** zero readers dessas colunas em `src/`, `supabase/functions/` ou `scripts/`. Edge Functions e scripts não as referenciam.
- **Externo:** BI, exports ou integrações fora deste repositório que leiam `clients.app_code` / `clients.url_donc` quebrariam. Sem visibilidade aqui — registrar no log de deploy se houver essa dependência.
- **Dados:** o backfill cobre apenas a primeira instância por cliente que ainda esteja sem valor. Se uma empresa tem múltiplas instâncias e só uma delas estava populada, o backfill não sobrescreve — comportamento conservador e desejado.

## Closed Items

_(none yet)_

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
