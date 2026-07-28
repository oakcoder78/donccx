# sync_service_log — Design Spec

**Date:** 2026-07-27
**Status:** implemented (Fase 1 — 2026-07-28)
**Backlog:** TD-006

## Purpose

Substituir o modelo monolítico do `sync_log` (um registro por execução do orquestrador `monthly-sync`, cobrindo 3 serviços) por rastreamento granular: cada serviço (`donc-api`, `freshdesk`, `health-recalc`) escreve seus próprios timestamps. Viabiliza exibir "última sincronização da API DONC" no cockpit de profissionais e, futuramente, por instância/cliente.

## Data Layer

### Nova tabela `sync_service_log`

```sql
CREATE TABLE public.sync_service_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_name  text NOT NULL CHECK (service_name IN ('donc-api', 'freshdesk', 'health-recalc')),
  status        text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  triggered_by  text NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual', 'cron', 'client-sync')),
  ref_month     text,                              -- YYYY-MM, nullable (health-recalc doesn't use months)
  instance_id   integer REFERENCES public.client_donc_instances(id) ON DELETE SET NULL,
  summary       jsonb,                             -- { synced: N, failed: N }
  error_message text
);

CREATE INDEX idx_sync_service_lookup  ON sync_service_log (service_name, ref_month, status);
CREATE INDEX idx_sync_service_latest  ON sync_service_log (service_name, started_at DESC);
CREATE INDEX idx_sync_service_stuck   ON sync_service_log (status, started_at) WHERE status = 'running';

ALTER TABLE sync_service_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_service_log_select_authenticated" ON sync_service_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "sync_service_log_insert_service_role"  ON sync_service_log FOR INSERT TO service_role  WITH CHECK (true);
CREATE POLICY "sync_service_log_update_service_role"  ON sync_service_log FOR UPDATE TO service_role  USING (true);
```

**Decisões:**
- `ref_month` como `text` (YYYY-MM) — mesmo formato de `client_usage.ref_month`, ordenação lexicográfica = cronológica
- `ON DELETE SET NULL` — evita travar remoção de instância, log permanece como histórico
- `GENERATED ALWAYS AS IDENTITY` — padrão do projeto (`sync_log` usa igual)
- 3 índices: lookup (cockpit), latest (settings UI), stuck (cleanup de jobs travados)
- RLS: `authenticated` SELECT, `service_role` INSERT/UPDATE — replica proteção do `sync_log`. **Estado pós-deploy:** RLS desabilitada (`20260728200000`) por simplicidade — apenas timestamps e metadados de sync, sem dados sensíveis. `GRANT SELECT` para `anon` e `authenticated`.
- Volume esperado: ~40 linhas/mês (~25 DONC instâncias + 1 freshdesk + 1 health)
- Coexistência com `sync_log`: ambas mantidas. `sync_log` continua servindo `SettingsSyncStatus`. Migração do frontend para `sync_service_log` na fase 2.

## Edge Functions (Write Side)

### `donc-api-sync/index.ts`

Para cada instância no loop de sync, antes da chamada à API DONC:

```ts
const { data: logEntry } = await admin
  .from('sync_service_log')
  .insert({
    service_name: 'donc-api',
    status: 'running',
    triggered_by: trigger === 'cron' ? 'cron' : 'manual',
    ref_month: refMonth,
    instance_id: inst.id,
  })
  .select('id')
  .single()
```

Ao final (sucesso ou falha), UPDATE pelo `id`:

```ts
// Success
await admin.from('sync_service_log').update({
  status: 'success', finished_at: new Date().toISOString(),
  summary: { synced: 1, failed: 0 },
}).eq('id', logId)

// Failure
await admin.from('sync_service_log').update({
  status: 'failed', finished_at: new Date().toISOString(),
  error_message: msg,
}).eq('id', logId)
```

### `monthly-sync/index.ts`

Sem mudanças. Os serviços chamados (`donc-api-sync`, `syncFreshdesk`, `health-recalc`) escrevem seus próprios logs. O `sync_log` orquestrador continua sendo escrito para compatibilidade com `SettingsSyncStatus`.

### `SettingsDoncAPI.jsx`

Sem mudanças no frontend. O sync manual já chama `donc-api-sync` com `trigger: 'manual'`, a edge function detecta e seta `triggered_by: 'manual'`.

## Frontend (Read Side)

### Cockpit `ProfissionaisCockpitPage.jsx`

Nova query no hook `useProfissionaisCockpit` (ou inline na página):

```js
const { data: lastSync } = useQuery({
  queryKey: ['last_donc_sync', refMonth],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('sync_service_log')
      .select('finished_at')
      .eq('service_name', 'donc-api')
      .eq('ref_month', refMonth)
      .eq('status', 'success')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
  },
  staleTime: 0,
  enabled: !!refMonth,
})
```

**Atenção:** o `queryFn` deve retornar `data` diretamente, não o envelope `{data, error}` do supabase — caso contrário o destructuring `const { data: lastSync }` recebe `{data, error}` e `lastSync.finished_at` é sempre `undefined`. Esse bug existia na versão original da spec e foi corrigido em `2f14ef5`. `throw error` em caso de falha para que erros reais não sejam mascarados como "nunca sincronizado".

Exibição na toolbar, alinhado à direita (na mesma linha dos filtros):

```jsx
<span className="ml-auto text-xs text-text-tertiary flex items-center gap-1 flex-shrink-0">
  <Icons.Clock className="w-3.5 h-3.5" />
  {lastSync?.finished_at ? (
    <>Última sinc: {new Date(lastSync.finished_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', timeZoneName: 'short' })}</>
  ) : (
    <span className="italic">Nunca sincronizado</span>
  )}
</span>
```

O span sempre renderiza; quando `lastSync` é null/undefined, exibe o rótulo `Nunca sincronizado` em itálico (`a685e9f`).

### `SettingsSyncStatus.jsx` (fase 2, pós-deploy)

Migrar queries de `sync_log` para `sync_service_log`, agrupando por `service_name` + `ref_month`. Fora do escopo imediato — não bloqueia o cockpit.

## Deploy

1. `supabase/migrations/20260727XXXXXX_create_sync_service_log.sql`
2. Editar `supabase/functions/donc-api-sync/index.ts`
3. `supabase db push --include-all`
4. `supabase functions deploy donc-api-sync`
5. Editar `src/pages/ProfissionaisCockpitPage.jsx`
6. `npm run build`
7. `git push origin main` → Vercel auto-deploy
8. Testar em https://donccx.vercel.app/profissionais-cockpit

## Validation

- Migration aplica sem erros
- Edge function deploya sem erros
- Build passa
- Cockpit exibe "Última sinc: ..." para meses com sync
- Cockpit exibe "Nunca sincronizado" para meses sem sync
- RLS: usuário autenticado faz SELECT com sucesso, INSERT retorna 403
- `donc-api-sync` manual via `/configuracoes` > API DONC gera entradas com `triggered_by='manual'`
