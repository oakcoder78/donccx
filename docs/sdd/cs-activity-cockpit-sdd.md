# SDD — Customer Success Radar (CS Radar)

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the **CS Radar** — a dashboard that aggregates activities, RMC reports, and project progress to help CS managers and CSMs understand what was done across the portfolio in any given period. It is accessed via the **Cockpits** gateway page (`/cockpits`), alongside the existing Health Score dashboard.

It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

### How to use this document

1. **Before implementing:** Read this document fully. Understand the data contracts, component tree, and business rules before touching any file.
2. **During implementation:** Follow the checklist for the active phase only. Do not skip ahead.
3. **After implementation:** Fill the Implementation Log for the completed phase before starting the next one.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main`
- **Last deploy:** `donccx.vercel.app`
- **Active phase:** Phase 5 — Not started

**What already exists related to this work:**
- `src/pages/CockpitsPage.jsx` — gateway `/cockpits` com cards para Health Score e CS Radar ✅
- `src/pages/CsRadarPage.jsx` — página completa com KPI cards, gráficos, heatmap e tabela de clientes ✅
- `src/hooks/useCsRadar.js` — hook de dados com queries de atividades, RMCs, projetos e milestones ✅
- `src/pages/HealthDashboardPage.jsx` — referência de design e estrutura para cockpits; seguir como template visual
- **Phase 3 (original)** — Charts: implementado na Phase 2 ✅
- **Phase 4 (original)** — Heatmap: implementado na Phase 2 ✅
- **Phase 5 (original)** — Client Table: implementado na Phase 2 ✅
- **Pending:** cores por tipo no gráfico, role gate no ResponsibleTable, filtros avançados, search/empty states
- `src/hooks/useClients.js` — hook com dados de carteira de clientes
- `activities` table — campos: `id`, `type`, `title`, `description`, `client_id`, `responsible_id`, `activity_date`, `status`, `created_at`
- `client_reports` table — campos: `id`, `client_id`, `period`, `status`, `published_at`, `created_by`
- `projects` table — campos: `id`, `client_id`, `title`, `status`
- `milestones` table — campos: `id`, `project_id`, `client_id`, `title`, `status`, `progress`, `due_date`
- `stages` table — stages validados em produção: Produção, Onboarding, Estabilização, Em espera, Expansão, Churned
- `profiles` table — campo `role` com valores: `admin`, `manager`, `csm`, `analyst`
- `src/lib/icons.js` — registry centralizado de ícones Lucide; **nunca importar diretamente de `lucide-react`**
- Feature flag infrastructure em `src/hooks/useFeatureFlags.js`
- Rota `/health-dashboard` já existe como referência de rota de cockpit

**What does NOT exist and needs to be created:**
- (Phase 1-2 complete. Remaining: Phase 3 — chart colors + role gate; Phase 4 — all filters; Phase 5 — search/empty states)

### Files to be touched (Phase 3+)

| File | Change type |
|---|---|
| `src/pages/CsRadarPage.jsx` | Modify — chart colors, role gate, additional filters, search |
| `src/hooks/useCsRadar.js` | Modify — add filter params (responsibleId, clientIds, activityTypes, segmentIds) |
| `src/hooks/useProfiles.js` | (already exists) — CSM list for ResponsibleSelect |
| `src/lib/icons.js` | Modify — registrar ícones novos se necessário |

> **Note:** Migration `20260523000000_cs_radar_flag.sql` criada com feature flag `cs_radar` (disabled, allowed: admin/manager/csm).

---

## 1. Global Definitions

### Feature flag
- **Key:** `cs_radar`
- **Default:** `false`
- **Allowed roles:** `admin`, `manager`, `csm`

### Route
- **Path:** `/cs-radar`
- **Page component:** `CsRadarPage`
- **Guard:** autenticado + feature flag `cs_radar` ativa

### Navigation placement
- Navbar: link `"Cockpits"` → `/cockpits` (substitui o link direto "Health Score")
- `/cockpits` é uma página gateway com dois cards: **Health Score** (`/health`) e **CS Radar** (`/cs-radar`)
- Cada card é condicionado à sua respectiva feature flag
- Título completo na página CS Radar: `"CS Radar"`

### Period filter — default e opções
```
PERIOD_OPTIONS = [
  { label: 'Últimos 7 dias',  days: 7  },
  { label: 'Últimos 30 dias', days: 30 },  // default
  { label: 'Últimos 90 dias', days: 90 },
  { label: 'Personalizado',   days: null }, // date range picker
]
```

### Activity exclusion rule
Excluir do cômputo de esforço do CSM atividades que satisfaçam **ambas** as condições:
- `type = 'nota'`
- `title = 'RMC visualizado'`

Todas as outras atividades — incluindo `type = 'email'` registrado pela plataforma — contam como esforço manual.

### "Sem toque" threshold
- **30 dias** para todos os segmentos ABC (revisão futura após calibração com dados reais)
- Clientes com última atividade (não-automática) há mais de 30 dias recebem sinalização visual na tabela

### RMC denominator rule
Clientes **excluídos** do denominador de RMCs esperados:
- `stage.name = 'Onboarding'`
- `stage.name = 'Em espera'`
- `stage.name = 'Churned'`

Clientes **incluídos**: Produção, Estabilização, Expansão.

### Project display rule
- Exibir 1 linha por cliente na tabela (não por projeto)
- Caso o cliente tenha projeto ativo: mostrar título do projeto + milestone em andamento + % progresso
- Caso o cliente tenha mais de 1 projeto ativo: exibir o de `created_at` mais recente + indicador `+N outros`
- Milestone em andamento = `milestones.status = 'em_andamento'`; fallback: milestone com `due_date` mais próxima

---

## 2. Design System Reference

Seguir `HealthDashboardPage.jsx` como template de layout e componentes. Padrão visual:
- Cards de KPI: fundo `bg-bg-secondary`, borda `border-border-tertiary`, valor numérico em `text-text-primary` (tamanho grande), label em `text-text-tertiary` (tamanho pequeno)
- Tabelas: mesma estrutura de `thead`/`tbody` usada nos módulos existentes
- Semáforos de atenção: usar `text-status-red` / `text-status-yellow` / `text-status-green` do design system
- Filtros: barra horizontal acima do conteúdo, mesmo padrão usado em `ActivitiesPage`
- Cores de tipo de atividade (para o gráfico de barras — apenas paleta do projeto):
  - `reuniao` → `#173557` (navy)
  - `ligacao` → `#59c2ed` (sky)
  - `email` → `#d3da47` (lime)
  - `whatsapp` → `#173557` opacity-60 (navy atenuado)
  - `tarefa` → `#59c2ed` opacity-60 (sky atenuado)
  - `nota` → `#94a3b8` (cinza neutro — apenas notas manuais; automáticas são excluídas)

---

## 3. Component Tree

```
CockpitsPage                       (/cockpits)
├── Card: Health Score              → /health
└── Card: CS Radar                  → /cs-radar

CsRadarPage                        (/cs-radar)
├── FilterBar
│   ├── PeriodSelect          (7d / 30d / 90d / custom)
│   ├── ResponsibleSelect     (visível apenas para admin/manager)
│   ├── ClientMultiSelect
│   ├── ActivityTypeSelect
│   └── SegmentSelect
│
├── KpiRow                    (4 cards)
│   ├── KpiCard — Total de atividades
│   ├── KpiCard — Clientes com toque
│   ├── KpiCard — RMCs publicados / esperados
│   └── KpiCard — Projetos com avanço
│
├── MiddleRow                 (2 colunas)
│   ├── ActivityTypeChart     (barras horizontais por tipo)
│   └── ResponsibleTable      (lista CSM + contagem de atividades)
│
├── ActivityHeatmap           (calendário de calor — dias do período)
│
└── ClientTable
    ├── ClientRow (por cliente ativo no filtro)
    │   ├── Col: Nome + Health Score badge
    │   ├── Col: Última atividade (data + tipo icon)
    │   ├── Col: Nº atividades no período
    │   ├── Col: RMC (último período publicado ou "—")
    │   ├── Col: Projeto ativo (título + milestone + %)
    │   └── Col: Semáforo (🔴 sem toque >30d | 🟡 sem RMC recente | 🟢 ok)
    └── EmptyState (nenhum cliente no filtro)
```

---

## 4. Data Contracts

### 4.1 Hook: `useCsRadar(filters)`

```js
// Input
filters = {
  dateFrom: Date,        // calculado a partir do period selecionado
  dateTo: Date,          // hoje
  responsibleId: uuid,   // null = todos
  clientIds: int[],      // [] = todos
  activityTypes: string[], // [] = todos
  segmentIds: int[],     // [] = todos
}

// Output
{
  kpis: {
    totalActivities: number,       // atividades não-automáticas no período
    clientsWithTouch: number,      // clientes com >= 1 atividade não-automática
    rmcPublished: number,          // RMCs com status='published' no período
    rmcExpected: number,           // clientes em stages elegíveis
    projectsWithProgress: number,  // projetos com >= 1 milestone movida no período
  },
  byType: { type: string, count: number }[],
  byResponsible: { name: string, count: number }[],
  heatmap: { date: string, count: number }[], // YYYY-MM-DD
  clients: ClientRow[],
  isLoading: boolean,
  error: any,
}
```

### 4.2 Query principal — atividades

```sql
SELECT
  a.id,
  a.type,
  a.title,
  a.activity_date,
  a.client_id,
  a.responsible_id,
  p.name AS responsible_name,
  c.fantasy_name AS client_name,
  c.health_total,
  c.abc_class
FROM activities a
JOIN clients c ON c.id = a.client_id
JOIN profiles p ON p.id = a.responsible_id
WHERE
  a.activity_date BETWEEN :dateFrom AND :dateTo
  -- Exclusão de atividades automáticas
  AND NOT (a.type = 'nota' AND a.title = 'RMC visualizado')
  -- Filtros opcionais
  AND (:responsibleId IS NULL OR a.responsible_id = :responsibleId)
  AND (:clientIds IS NULL OR a.client_id = ANY(:clientIds))
  AND (:activityTypes IS NULL OR a.type = ANY(:activityTypes))
ORDER BY a.activity_date DESC
```

### 4.3 Query — RMCs publicados no período

```sql
SELECT
  cr.client_id,
  cr.period,
  cr.published_at,
  c.fantasy_name
FROM client_reports cr
JOIN clients c ON c.id = cr.client_id
WHERE
  cr.status = 'published'
  AND cr.published_at BETWEEN :dateFrom AND :dateTo
```

### 4.4 Query — clientes elegíveis para RMC (denominador)

```sql
SELECT c.id, c.fantasy_name
FROM clients c
JOIN stages s ON s.id = c.stage_id
WHERE s.name NOT IN ('Onboarding', 'Em espera', 'Churned')
```

### 4.5 Query — projetos com avanço no período

```sql
-- Milestones com status alterado para 'em_andamento' ou 'done' no período
-- Como não há tabela de histórico de milestones, usar updated_at como proxy
SELECT DISTINCT p.id, p.client_id, p.title
FROM milestones m
JOIN projects p ON p.id = m.project_id
WHERE
  m.updated_at BETWEEN :dateFrom AND :dateTo
  AND m.status IN ('em_andamento', 'done')
```

> **Gotcha:** `milestones` não tem tabela de histórico de status. O `updated_at` é a melhor proxy disponível. Se no futuro for criado um log de histórico de milestones, esta query deve ser atualizada.

### 4.6 Query — linha de cliente na tabela

```sql
SELECT
  c.id,
  c.fantasy_name,
  c.health_total,
  c.abc_class,
  s.name AS stage_name,
  -- Última atividade não-automática
  (
    SELECT MAX(a.activity_date)
    FROM activities a
    WHERE a.client_id = c.id
      AND NOT (a.type = 'nota' AND a.title = 'RMC visualizado')
  ) AS last_activity_date,
  (
    SELECT a.type
    FROM activities a
    WHERE a.client_id = c.id
      AND NOT (a.type = 'nota' AND a.title = 'RMC visualizado')
    ORDER BY a.activity_date DESC
    LIMIT 1
  ) AS last_activity_type,
  -- RMC mais recente publicado
  (
    SELECT cr.period
    FROM client_reports cr
    WHERE cr.client_id = c.id AND cr.status = 'published'
    ORDER BY cr.published_at DESC
    LIMIT 1
  ) AS last_rmc_period,
  -- Projeto ativo mais recente
  (
    SELECT p.title
    FROM projects p
    WHERE p.client_id = c.id
      AND p.status IN ('planejado', 'em_andamento')
    ORDER BY p.created_at DESC
    LIMIT 1
  ) AS active_project_title,
  -- Milestone em andamento do projeto ativo
  (
    SELECT m.title
    FROM milestones m
    JOIN projects p ON p.id = m.project_id
    WHERE p.client_id = c.id
      AND p.status IN ('planejado', 'em_andamento')
      AND m.status = 'em_andamento'
    ORDER BY m.due_date ASC
    LIMIT 1
  ) AS active_milestone_title,
  (
    SELECT m.progress
    FROM milestones m
    JOIN projects p ON p.id = m.project_id
    WHERE p.client_id = c.id
      AND p.status IN ('planejado', 'em_andamento')
      AND m.status = 'em_andamento'
    ORDER BY m.due_date ASC
    LIMIT 1
  ) AS active_milestone_progress
FROM clients c
JOIN stages s ON s.id = c.stage_id
WHERE s.name NOT IN ('Churned')
ORDER BY c.fantasy_name ASC
```

### 4.7 Semáforo logic (ClientRow)

```js
function getClientSignal(client, activitiesInPeriod) {
  const daysSinceTouch = client.last_activity_date
    ? daysBetween(client.last_activity_date, today)
    : 999

  if (daysSinceTouch > 30) return 'red'    // sem toque há mais de 30 dias
  if (!client.last_rmc_period) return 'yellow' // nunca teve RMC publicado
  if (activitiesInPeriod === 0) return 'yellow' // ativo mas sem toque no período filtrado
  return 'green'
}
```

---

## 5. UI Spec

```
┌─────────────────────────────────────────────────────────────────────┐
│  CS Radar                                     [Período ▾] [Filtros] │
├─────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│ │  47           │ │  11 / 14     │ │  3 / 8       │ │  5         │ │
│ │  Atividades  │ │  Com toque   │ │  RMC pub.    │ │  Proj. av. │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
├────────────────────────────┬────────────────────────────────────────┤
│  Por tipo (barras horiz.)  │  Por responsável                       │
│  reunião  ████████ 18      │  Jorge C.    ████████ 22              │
│  ligação  █████ 12         │  Thomás P.   ████ 10                  │
│  email    ███ 8             │  Fabio B.    ███ 8                    │
│  whatsapp ██ 5              │  Jéssica     ██ 5                     │
│  tarefa   █ 4               │                                        │
├────────────────────────────┴────────────────────────────────────────┤
│  Heatmap de atividade (maio 2026)                                   │
│  [seg] [ter] [qua] [qui] [sex] [sáb] [dom]                         │
│   ░     ▒     ▓     ░     ▒     ░     ░    ← semana 1              │
│   ▒     ▓     ▓     ▓     ░     ░     ░    ← semana 2              │
│   (intensidade = volume de atividades no dia)                       │
├─────────────────────────────────────────────────────────────────────┤
│  Cliente          HS   Última atv.   Qtd   RMC        Projeto   ●  │
│  ─────────────────────────────────────────────────────────────────  │
│  Lojas Simonetti  81   12/mai (📞)   8     abr/26    Onboard…  🟢  │
│  Eletromóveis     67   28/abr (✉)   3     mar/26    —          🟡  │
│  Lojas Todimo     74   02/mai (👥)   5     abr/26    Expansão…  🟢  │
│  Cliente X        55   15/abr (—)   0     fev/26    —          🔴  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Phases

### Phase 1 — Foundation: CockpitsPage gateway, CS Radar skeleton, migration

**Status:** Complete

**Rationale:** Substituir o link direto "Health Score" na Navbar por um gateway "Cockpits" que dá acesso tanto ao Health Score quanto ao novo CS Radar. Criar a estrutura mínima do CS Radar — migration com feature flag, rota protegida e página esqueleto.

**Scope:**
- Migration `030_cs_radar_flag.sql` com INSERT na tabela `feature_flags`
- `CockpitsPage.jsx` em `/cockpits` com dois cards linkando para Health Score e CS Radar
- Substituir link "Health Score" na Navbar por "Cockpits" → `/cockpits`
- Rota `/cs-radar` no router com guard de autenticação + feature flag
- `CsRadarPage.jsx` com estrutura esqueleto (título + placeholder)
- Registro dos ícones necessários em `src/lib/icons.js`

#### Checklist

- [ ] **Migration:** `030_cs_radar_flag.sql` criada e aplicada
  - [ ] INSERT em `feature_flags` com key `cs_radar`, enabled `false`, allowed_roles `['admin','manager','csm']`
- [ ] **CockpitsPage:** `CockpitsPage.jsx` em `/cockpits` com cards para Health Score e CS Radar
  - [ ] Cada card condicionado à sua respectiva feature flag
- [ ] **Navbar:** link "Health Score" substituído por "Cockpits" → `/cockpits`
- [ ] **Route:** `/cs-radar` adicionada ao router com guards corretos
- [ ] **Page:** `CsRadarPage.jsx` criada com título e layout vazio
- [ ] **Icons:** ícones necessários registrados em `icons.js`
- [ ] **Build:** `npm run build` sem erros

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-19 | — | `supabase/migrations/20260523000000_cs_radar_flag.sql`, `src/pages/CockpitsPage.jsx`, `src/pages/CsRadarPage.jsx`, `src/App.jsx`, `src/components/layout/Navbar.jsx` | Migration cs_radar flag; CockpitsPage gateway (/cockpits) with Health + CS Radar cards; CsRadarPage skeleton; updated Navbar and routes |

---

### Phase 2 — Hook + KPI Row

**Status:** Complete

**Rationale:** Construir o hook de dados com as queries validadas e os 4 KPI cards. É o núcleo do cockpit — tudo mais depende desse hook estar funcional e tipado corretamente.

**Scope:**
- `useCsRadar.js` com filtros de período, responsável, cliente, tipo e segmento
- Queries 4.2, 4.3, 4.4 e 4.5 implementadas
- `KpiRow` com os 4 `KpiCard` conectados ao hook
- FilterBar com `PeriodSelect` funcional (os demais filtros podem ser stubs)

#### Checklist

- [ ] **Hook:** `useCsRadar.js` criado com interface de filtros definida
- [ ] **Query activities:** exclusão de `type='nota' AND title='RMC visualizado'` aplicada
- [ ] **Query RMC:** denominador exclui Onboarding, Em espera, Churned
- [ ] **KpiRow:** 4 cards renderizando valores reais do hook
- [ ] **FilterBar:** PeriodSelect funcional com default 30 dias
- [ ] **Build:** `npm run build` sem erros

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-19 | `31451e9` | `src/pages/CsRadarPage.jsx`, `src/hooks/useCsRadar.js` | useCsRadar hook with 4 queries (activities, RMCs, eligible clients, projects+milestones); CsRadarPage with KPI row, activity type chart, responsible chart, heatmap grid, client table with semaphore sorting |
| 2026-05-19 | `c64e3a6` | `src/hooks/useCsRadar.js` | Add `lifecycle_stage = 'cliente'` filter to client query |
| 2026-05-19 | `31451e9` | `src/pages/CsRadarPage.jsx` | Replace period buttons with dropdown (Este mês, Último mês, Últimos 30/90d, Todo período, Personalizado) |
| 2026-05-19 | `3a228e9` | `src/pages/CsRadarPage.jsx` | Fix heatmap: complete day grid, proper week breaks, opacity-only cells, tooltip |

---

### Phase 3 — Charts refinement + role gate

**Status:** Complete

**Rationale:** Os gráficos de barras por tipo e por responsável já foram implementados na Phase 2, mas faltam: (a) cores específicas por tipo de atividade conforme a paleta do projeto; (b) tabela de responsáveis oculta para CSMs e analysts.

**Scope:**
- Aplicar cores do design system às barras de tipo (reuniao → navy `#173557`, ligacao → sky `#59c2ed`, email → lime `#d3da47`, whatsapp → navy/60, tarefa → sky/60, nota → slate `#94a3b8`)
- `ResponsibleTable` (seção "Por responsável") oculto para role `csm` e `analyst`
- Ambos usam dados já existentes no hook — sem novas queries

#### Checklist

- [ ] **ActivityTypeChart:** cores corretas por tipo na barra e no label
- [ ] **ResponsibleTable:** oculto para `csm` e `analyst`
- [ ] **Build:** `npm run build` sem erros

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

**Rationale:** Adicionar as visualizações de distribuição. São independentes entre si e podem ser implementadas em sequência no mesmo session.

**Scope:**
- `ActivityTypeChart` — barras horizontais com cores por tipo (ver seção 2)
- `ResponsibleTable` — tabela simples com nome + contagem; visível apenas para `admin` e `manager`
- Ambos conectados ao hook existente (sem novas queries)

#### Checklist

- [ ] **ActivityTypeChart:** barras horizontais, cores corretas por tipo, responsivo
- [ ] **ResponsibleTable:** oculto para role `csm` e `analyst`
- [ ] **Build:** `npm run build` sem erros

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 4 — Heatmap

**Status:** Superseded — merged into Phase 2 (heatmap already implemented: complete grid, week alignment, opacity scale, tooltip)

**Rationale:** O heatmap de calendário é a feature visualmente mais diferenciada do cockpit. Separado em fase própria por complexidade de implementação (geração da grade de dias, intensidade por volume, responsividade).

**Scope:**
- `ActivityHeatmap` — grade semanal com intensidade por volume de atividades por dia
- Tooltip com contagem ao hover
- Conectado ao array `heatmap` do hook (query 4.2 agrupada por `activity_date`)

#### Checklist

- [ ] **Heatmap:** grade corretamente alinhada por dia da semana
- [ ] **Intensidade:** escala de cor do design system (usar opacidade do navy ou sky)
- [ ] **Tooltip:** exibe data + contagem ao hover
- [ ] **Build:** `npm run build` sem erros

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 5 — Client Table

**Status:** Superseded — merged into Phase 2 (client table already implemented: all columns, semaphore, sorting, +N indicator. Pending: remaining filters moved to new Phase 4)

**Rationale:** A tabela de clientes é o entregável de maior valor operacional do cockpit. Fase final porque depende de todas as queries do hook estarem estáveis.

**Scope:**
- `ClientTable` com `ClientRow` por cliente
- Query 4.6 implementada no hook
- Semáforo logic (seção 4.7) aplicada
- Filtros restantes da FilterBar funcionais (ClientMultiSelect, ActivityTypeSelect, SegmentSelect, ResponsibleSelect completo)
- Ordenação da tabela por semáforo (vermelho primeiro) como default

#### Checklist

- [ ] **ClientTable:** todas as colunas especificadas na seção 5 presentes
- [ ] **Semáforo:** lógica da seção 4.7 aplicada corretamente
- [ ] **Ordenação:** default por semáforo (🔴 → 🟡 → 🟢), clicável por coluna
- [ ] **Filtros:** todos os seletores da FilterBar funcionais e integrados ao hook
- [ ] **EmptyState:** exibido quando nenhum cliente corresponde ao filtro
- [ ] **Projeto +N:** indicador exibido quando cliente tem >1 projeto ativo
- [ ] **Build:** `npm run build` sem erros

#### Implementation Log (Phase 5)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-19 | — | `src/pages/CsRadarPage.jsx` | Activity type colors (navy/sky/lime/slate per SDD section 2); ResponsibleTable hidden for csm/analyst |

---

### Phase 4 (new) — All filters

**Status:** Complete

**Rationale:** Os filtros de período já estão funcionais (dropdown). Faltam os demais filtros da FilterBar para completar a experiência: seleção de responsável (apenas admin/manager), multiselect de clientes, tipo de atividade e segmento.

**Scope:**
- `ResponsibleSelect` — dropdown de CSMs, visível apenas para admin/manager (usar `useProfiles`)
- `ClientMultiSelect` — multiselect de clientes (busca + checkboxes ou combobox)
- `ActivityTypeSelect` — multiselect de tipos de atividade
- `SegmentSelect` — dropdown/multiselect de segmentos
- Todos conectados ao hook via `filters`

#### Checklist

- [ ] **ResponsibleSelect:** dropdown de CSMs, admin/manager only
- [ ] **ClientMultiSelect:** funcional, conectado ao hook
- [ ] **ActivityTypeSelect:** funcional
- [ ] **SegmentSelect:** funcional
- [ ] **Build:** `npm run build` sem erros

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-19 | — | `src/pages/CsRadarPage.jsx` | Add ResponsibleSelect, ClientMultiSelect, ActivityTypeSelect, SegmentSelect + MultiSelect component + "Limpar filtros" + error retry |

---

### Phase 5 (new) — Empty & search states

**Status:** Not started

**Rationale:** Refinamentos de UX: busca textual com debounce, estados de shimmer/loading mais refinados, empty states específicos, e tratamento de erros mais amigável.

**Scope:**
- Campo de busca textual (debounce 300ms, por nome do cliente)
- Shimmer skeleton para loading inicial
- Empty states específicos (sem atividades, sem clientes, sem RMCs)
- Tratamento de erro com botão de retry

#### Checklist

- [ ] **Search:** campo de busca com debounce, filtra clientes na tabela
- [ ] **Shimmer:** skeleton durante loading inicial
- [ ] **Empty states:** mensagens específicas por seção
- [ ] **Error:** mensagem amigável + botão retry
- [ ] **Build:** `npm run build` sem erros

#### Implementation Log (Phase 5)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

## 7. Open Questions

| # | Questão | Status |
|---|---|---|
| 1 | Label de navegação | ✅ Resolvido — `"CS Radar"` (Customer Success Radar) |
| 2 | Cores do gráfico de barras | ✅ Resolvido — paleta do projeto (navy, sky, lime + opacidades) |
| 3 | Heatmap: escala de cor | ✅ Resolvido — sky `#59c2ed` como base, gradação por opacidade |
| 4 | Threshold de "sem toque" será configurável via UI futuramente? | Backlog futuro |
| 5 | Incluir coluna de MRR na ClientTable para contexto financeiro? | Avaliar na Phase 5 |
