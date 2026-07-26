# Profissionais Cockpit — Design Spec

**Date:** 2026-07-26
**Status:** draft
**Feature flag:** `profissionais_cockpit`

## Purpose

Cockpit para o time financeiro extrair dados de profissionais por cliente com base no mês anterior, usado como referência de faturamento.

## Data Source

Tabela `client_usage`, coluna `profissionais_versao` (JSONB — array de profissionais). Cada elemento:

```json
{
  "nome": "ADRIANO",
  "ativo": true,
  "email": "...",
  "versaoApp": null,
  "dataUltimaOS": "2024-03-07T08:50:17.44",
  "codigoUltimaOS": "73428",
  "dataUltimoLogin": "2026-06-30T14:35:47.193"
}
```

Populado via Edge Function `donc-api-sync` durante a sincronização mensal da API DONC.

## Metrics (3 por cliente, com delta vs mês-2)

| Métrica | Critério |
|---------|----------|
| **Profissionais Ativos** | `ativo = true` |
| **Com acesso no Mês** | `dataUltimoLogin` cai dentro do `ref_month` (todos os profissionais, independente de `ativo`) |
| **Com OS no Mês** | `dataUltimaOS` cai dentro do `ref_month` (todos os profissionais, independente de `ativo`) |

**Mês de referência:** dropdown com meses disponíveis (populado via `SELECT DISTINCT ref_month FROM client_usage WHERE profissionais_versao IS NOT NULL ORDER BY ref_month DESC`). Default selecionado = mês anterior ao atual (ex: em julho/2026 → `2026-06`).

**Delta:** `ROUND((cur - prev) / prev * 100, 1)`. Se `prev = 0`, retorna `NULL`. Exibido com seta colorida (▲ verde / ▼ vermelho).

Agregação: soma entre instâncias do mesmo cliente. Só retorna clientes com pelo menos 1 métrica > 0 no mês corrente.

## Access Control

Feature flag `profissionais_cockpit` com `allowed_roles = ['admin', 'manager', 'csm']`.

- Visibilidade no hub `CockpitsPage`: `isEnabled('profissionais_cockpit', profile.role)`
- Gerenciável via `SettingsFeatureFlags` (tabela `feature_flags`)
- Cockpit segue RLS padrão — `csm` vê apenas clientes onde `csm_id = auth.uid()`

## Backend — Postgres RPCs

### `get_profissionais_cockpit(p_ref_month text)`

Expande `profissionais_versao` com `jsonb_array_elements`, aplica os 3 filtros de data contra o mês, agrega por cliente, faz pivot cur/prev e calcula delta.

**Retorno por cliente:** `client_id`, `client_name`, `ativos_cur`, `ativos_prev`, `ativos_delta`, `acesso_cur`, `acesso_prev`, `acesso_delta`, `os_cur`, `os_prev`, `os_delta`.

Respeita RLS: filtra por `csm_id` para role `csm`.

### `get_profissionais_detalhe(p_client_id int, p_ref_month text)`

Expande `profissionais_versao` para um cliente específico no mês, filtra profissionais que atendem pelo menos um dos 3 critérios (OR: ativo OU login no mês OU OS no mês).

**Retorno:** `nome`, `email`, `ativo`, `data_ultimo_login`, `data_ultima_os`, `codigo_ultima_os`.

### `get_profissionais_export(p_ref_month text)`

Igual ao `get_profissionais_detalhe` mas para todos os clientes de uma vez. Usado pelo CSV Analítico. Também respeita RLS.

**Retorno:** `client_id`, `client_name`, `nome`, `email`, `ativo`, `data_ultimo_login`, `data_ultima_os`, `codigo_ultima_os`.

### Migration

Arquivo único em `supabase/migrations/` com:
1. `INSERT INTO feature_flags` para `profissionais_cockpit`
2. `CREATE OR REPLACE FUNCTION get_profissionais_cockpit`
3. `CREATE OR REPLACE FUNCTION get_profissionais_detalhe`
4. `CREATE OR REPLACE FUNCTION get_profissionais_export`

## Frontend

### Rota

`/profissionais-cockpit` dentro do `PrivateRoute` em `App.jsx`.

### Hook — `useProfissionaisCockpit.js`

```js
// Available months for dropdown
useQuery({
  queryKey: ['profissionais_available_months'],
  queryFn: () => supabase
    .from('client_usage')
    .select('ref_month')
    .not('profissionais_versao', 'is', null)
    .order('ref_month', { ascending: false }),
  staleTime: 10 * 60 * 1000,
})

// Main data (re-fetches when refMonth changes)
useQuery({
  queryKey: ['profissionais_cockpit', refMonth],
  queryFn: () => supabase.rpc('get_profissionais_cockpit', { p_ref_month: refMonth }),
  staleTime: 5 * 60 * 1000,
  enabled: !!profile && !!refMonth,
})
```

### Página — `ProfissionaisCockpitPage.jsx`

**Header:** `PageHeader` title "Profissionais · Faturamento", subtitle com mês de referência formatado (ex: "Junho/2026").

**Toolbar:** seletor de mês (dropdown com meses disponíveis, default = mês anterior) + campo de busca textual (filtra nome do cliente) + dropdown "Exportar CSV ▾" com opções Sintético e Analítico.

**Tabela principal (accordion):**

| Cliente | Ativos | Δ | Acesso no mês | Δ | OS no mês | Δ | |
|---------|--------|---|---------------|----|-----------|----|--|
| Center Móveis | 120 | ▲12% | 115 | ▼3% | 98 | ▲8% | ▸ |

Padrão de expand/collapse inline (`Set`-based, múltiplas rows simultâneas), igual `ProjectCockpitPage.jsx`.

**Estado da row colapsada:** apenas a linha da tabela principal com chevron.

**Estado da row expandida:**
1. **Loading:** spinner + "Carregando profissionais de [Cliente]... pode levar alguns segundos"
2. **Dados:** subtabela Nome | Email | Último Login | Última OS | Código OS
3. **Erro:** mensagem + botão "Tentar novamente"
4. **Ações:** botões "Exportar CSV" e "Exportar PDF" (visíveis só com dados carregados)

A RPC `get_profissionais_detalhe` é chamada apenas no primeiro clique de expand.

### Loading / Empty / Error

- **Loading:** 5 skeleton rows `animate-pulse`
- **Empty:** "Nenhum dado de profissionais encontrado para [mês]"
- **Error:** div com mensagem + botão "Tentar novamente" (refetch)

### Card no Hub

Entrada no array `cockpits` em `CockpitsPage.jsx`:
```js
{
  key: 'profissionais_cockpit',
  title: 'Profissionais',
  description: 'Faturamento por profissionais ativos, acesso e OS no mês',
  icon: Icons.UserCheck,
  href: '/profissionais-cockpit',
  color: 'text-donc-verde',
  bgColor: 'bg-donc-verde/10',
}
```

## Export

### CSV

Padrão: `Blob` + `URL.createObjectURL` + download via `<a>` tag (idem `BriefResponsesModal.jsx`).

Opções disponíveis:

| Origem | Escopo | Modo | Dados |
|--------|--------|------|-------|
| Toolbar | Todos | Sintético | Tabela principal (memória) |
| Toolbar | Todos | Analítico | RPC `get_profissionais_export` |
| Row expandida | Individual | Sintético | Métricas daquele cliente (memória) |
| Row expandida | Individual | Analítico | Dados já carregados no estado da row |

### PDF

Apenas individual (por cliente), via row expandida.

Padrão: renderizar HTML formatado com métricas + lista de profissionais, `window.print()` + `@media print` CSS (idem `ReportPublicPage.jsx`). Zero dependências.

## Icons

Novos ícones em `src/lib/icons.js`:
- `UserCheck` (lucide: `UserCheck`) — card do hub
- `FileDown` (lucide: `FileDown`) — botão de export

## Deploy

1. Editar/criar migration SQL
2. `supabase db push --include-all`
3. `npm run build`
4. `git push origin main`
5. Vercel auto-deploy
6. Testar em https://donccx.vercel.app/profissionais-cockpit
