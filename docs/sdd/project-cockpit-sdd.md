# SDD — Project Cockpit

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the **Project Cockpit** — a dashboard that aggregates all clients with active projects, showing current phase, delivery status (on-time/delayed), and completion progress. It is accessed via the **Cockpits** gateway page (`/cockpits`), alongside the existing Health Score and CS Radar.

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
- **Active phase:** Complete — all phases implemented

**What already exists related to this work:**

- `src/pages/CockpitsPage.jsx` — gateway `/cockpits` com cards para Health Score e CS Radar
- `src/hooks/useFeatureFlags.js` — infra de feature flags via tabela `feature_flags`
- `src/hooks/useAllProjects()` em `useProjects.js` — retorna todos os projetos com `client` join e `onboarding_fases`
- `src/hooks/useMilestones.js` — `useAllMilestones()` para milestones globais
- `projects` table — campos: `id`, `client_id`, `title`, `type`, `status`, `onboarding_id`, `start_date`, `end_date`
- `onboardings` table — campos: `id`, `client_id`, `status`, `situacao_geral`, `fase_atual_id`, `start_date`, `end_date`
- `onboarding_fases` table — campos: `id`, `onboarding_id`, `status`, `planned_start`, `planned_end`, `display_order`
- `milestones` table — campos: `id`, `project_id`, `title`, `status`, `progress`, `due_date`
- `onboarding_activities` table — campos: `id`, `onboarding_id`, `fase_id`, `title`, `status`, `due_date`, `responsible_contato_id`, `responsible_interno_id`
- `OnboardingDetailPage.jsx` — `PhaseCircle` + `Connector` components (inline) for horizontal timeline
- `ClientSubProjetos.jsx` — accordion pattern (custom, no library) for expandable rows
- Feature flag infra via `src/hooks/useFeatureFlags.js` + tabela `feature_flags`
- Role gating: `admin`, `manager`, `csm`, `analyst`
- `src/lib/icons.js` — registry centralizado de ícones Lucide; **nunca importar diretamente de `lucide-react`**

**What does NOT exist and needs to be created:**

- Feature flag `projects_cockpit` no banco (migration SQL)
- `src/pages/ProjectCockpitPage.jsx` — página principal do cockpit
- Botão de filtro por CSM (admin vê todos; manager/csm vê seu portfólio)
- Componentes de linha expansível com timeline + atividades
- Rota `/projetos-cockpit` em `App.jsx`
- Card no `CockpitsPage.jsx`
- Função de cálculo de progresso (fases para onboarding, milestones para internos)

### Files to be touched

| File | Change type |
|---|---|
| `supabase/migrations/<timestamp>_projects_cockpit_flag.sql` | Create — migration da feature flag |
| `src/pages/CockpitsPage.jsx` | Modify — adicionar card do Project Cockpit |
| `src/pages/ProjectCockpitPage.jsx` | **Create** — página principal |
| `src/App.jsx` | Modify — adicionar rota `/projetos-cockpit` |
| `src/lib/icons.js` | Modify — registrar ícones novos se necessário |

---

## 1. Business Rules

### 1.1. O que é um "projeto ativo"

Um projeto é considerado **ativo** se `status IN ('planejado', 'em_andamento')`. Projetos `concluido` ou `suspenso` são filtrados.

### 1.2. Agrupamento por cliente

Se um cliente tem **múltiplos projetos ativos**, todos aparecem na mesma linha do cliente. A linha mostra um resumo consolidado do projeto **mais relevante** (o que está em estágio mais crítico ou mais recente).

Regra de desempate:
1. Projeto com `situacao_geral = 'travado'` tem prioridade
2. Depois `'atencao'`
3. Depois o mais recente (`created_at`)

### 1.3. Cálculo de Progresso

**Para onboarding/expansão (`onboarding_id` existe):**

```
progress = (concluidas + em_andamento * 0.5) / total_fases * 100
```

Onde `concluidas` = fases com `status = 'concluida'`, `em_andamento` = fases com `status = 'ativa'`, `total_fases` = todas as fases do onboarding.

**Para projetos internos (sem `onboarding_id`):**

Usar milestones:
```
progress = avg(milestones.progress)  -- média do campo progress (0-100)
```
Se não houver milestones, progress = 0.

### 1.4. Situação (em dia / atrasado)

A situação é determinada pela **fase ativa** do onboarding (ou milestone ativo para internos):

| Condição | Resultado | Ícone |
|---|---|---|
| `onboardings.situacao_geral = 'travado'` | ⏸ Parado | `Icons.PauseCircle` |
| `fase_atual.planned_end < hoje` | 🔴 Atrasado | `Icons.AlertCircle` |
| demais casos | 🟢 Em dia | `Icons.CheckCircle2` |

Para projetos internos sem onboarding, usar `milestones` com status `'em_andamento'` e verificar `due_date`.

### 1.5. Role gating

| Role | Comportamento |
|---|---|
| `admin` | Vê todos os clientes |
| `manager` | Vê clientes do seu time (CSMs que reportam a ele) |
| `csm` | Vê apenas seus próprios clientes |
| `analyst` | Sem acesso (feature flag bloqueia) |

Feature flag config: `projects_cockpit`, `allowed_roles: ['admin', 'manager', 'csm']`.

---

## 2. Data Contracts

### 2.1. Query principal

```sql
-- Buscar todos os projetos ativos com joins
SELECT
  p.id, p.client_id, p.title, p.type, p.status, p.onboarding_id,
  p.start_date, p.end_date, p.created_at,
  c.fantasy_name, c.abc_class,
  o.situacao_geral, o.fase_atual_id,
  pf.id AS fase_atual_id,
  pf.title AS fase_atual_nome,
  pf.status AS fase_atual_status,
  pf.planned_end AS fase_atual_planned_end,
  (
    SELECT COUNT(*) FROM onboarding_fases of2
    WHERE of2.onboarding_id = o.id
  ) AS total_fases,
  (
    SELECT COUNT(*) FROM onboarding_fases of2
    WHERE of2.onboarding_id = o.id AND of2.status = 'concluida'
  ) AS fases_concluidas,
  (
    SELECT COUNT(*) FROM onboarding_fases of2
    WHERE of2.onboarding_id = o.id AND of2.status = 'ativa'
  ) AS fases_ativas
FROM projects p
JOIN clients c ON c.id = p.client_id
LEFT JOIN onboardings o ON o.id = p.onboarding_id
LEFT JOIN onboarding_fases pf ON pf.id = o.fase_atual_id
WHERE p.status IN ('planejado', 'em_andamento')
ORDER BY c.fantasy_name ASC;
```

### 2.2. Projeção do frontend (data shape)

```typescript
interface CockpitRow {
  clientId: number
  clientName: string
  abcClass: string | null
  projects: ActiveProject[]
  // Resumo (do projeto mais relevante):
  currentPhase: string | null
  status: 'on_time' | 'delayed' | 'paused'
  progress: number  // 0-100
}

interface ActiveProject {
  id: number
  title: string
  type: 'onboarding' | 'expansao' | 'interno'
  status: string
  onboardingId: number | null
  situation: string | null  // fluindo / atencao / travado
  totalPhases: number
  completedPhases: number
  activePhases: number
  currentPhase: { id: number, name: string, status: string, plannedEnd: string } | null
  milestones: Milestone[]
  progress: number
}

interface Milestone {
  id: number
  title: string
  status: string
  progress: number
  dueDate: string | null
}
```

### 2.3. Dados do expand (timeline + atividades)

**Timeline:** lista de `onboarding_fases` ordenadas por `display_order`, cada uma com:
- `title`, `status`, `planned_start`, `planned_end`
- Se é a fase atual (match com `fase_atual_id`)

**Atividades:** `onboarding_activities` do onboarding, filtradas por `status IN ('pendente', 'em_andamento')`, ordenadas por `due_date ASC`.

---

## 3. Component Tree

```
CockpitsPage (hub)
  └── Novo card: "Projetos" → href="/projetos-cockpit"

ProjectCockpitPage
  ├── PageHeader
  ├── Filtros:
  │   ├── CSM select (admin/manager vêem seletor; csm não vê)
  │   └── Status filter (todos / em dia / atrasado / parado)
  │
  ├── SummaryBar (opcional):
  │   ├── Total de clientes com projeto ativo
  │   ├── % em dia
  │   └── % com atraso
  │
  └── ClientRowList
      └── ClientRow (expansível)
          ├── [collapse] Colapsado:
          │   ├── Cliente nome + ABC class badge
          │   ├── Fase atual
          │   ├── Status indicator (🟢/🔴/⏸)
          │   └── Progress bar
          │
          └── [expand] Expandido:
              ├── ProjectTimeline (horizontal, PhaseCircle + Connector)
              ├── ProjectActivitiesList (atividades pendentes)
              └── Se múltiplos projetos ativos: tabs ou sub-rows
```

### 3.1. State Management

- `useQuery` com TanStack Query para dados dos projetos
- Query key: `['projects_cockpit']`
- `staleTime: 30s`, `retry: 1`, `gcTime: 5m`
- Estado de expansão: `Set<clientId>` (mesmo padrão do `ClientSubProjetos.jsx`)
- Filtros: estado local (`useState`), sem URL params

---

## 4. Phases

### Phase 1 — Scaffold + Feature Flag

- [ ] Criar migration `projects_cockpit_flag.sql`:
  ```sql
  insert into feature_flags (key, label, enabled, allowed_roles)
  values ('projects_cockpit', 'Project Cockpit', false, '{admin,manager,csm}');
  ```
- [ ] Criar `src/pages/ProjectCockpitPage.jsx` com estrutura vazia (PageHeader + "Em construção")
- [ ] Adicionar rota em `src/App.jsx`: `<Route path="/projetos-cockpit" element={<ProjectCockpitPage />} />`
- [ ] Adicionar card em `CockpitsPage.jsx` (com feature flag gate)
- [ ] Registrar ícone novo em `src/lib/icons.js` se necessário
- [ ] Verificar build

### Phase 2 — Query + Data Layer

- [ ] Criar hook `useProjectCockpit.js` (ou adicionar query em `useProjects.js`)
- [ ] Query agregada que retorna `CockpitRow[]` conforme data contracts
- [ ] Implementar cálculo de progresso (fases para onboarding, milestones para interno)
- [ ] Implementar lógica de situação (em dia / atrasado / parado)
- [ ] Implementar role gating (filtrar por CSM conforme role)
- [ ] Tratar loading / empty / error states

### Phase 3 — Client Rows + Indicators

- [ ] Componente `ClientRow` (expansível, mesmo padrão do `ClientSubProjetos.jsx`)
- [ ] Progress bar visual (SVG ou div com width %)
- [ ] Status indicator (ícone + cor)
- [ ] Fase atual display
- [ ] SummaryBar com totais

### Phase 4 — Timeline + Activities (expand)

- [ ] `ProjectTimeline` — reaproveitar `PhaseCircle` + `Connector` do `OnboardingDetailPage.jsx`, versão compacta
- [ ] `ProjectActivitiesList` — lista de atividades pendentes/em_andamento
- [ ] Suporte a múltiplos projetos na mesma linha (tabs ou sub-rows)

---

## 5. UI Reference

### 5.1. Collapsed row layout

```
┌──────────────────────────────────────────────────────────────────┐
│ 🟢 Empresa ABC        ABC: A   Fase: Discovery    ████████░░ 72% │
│ 🔴 Empresa XYZ        ABC: B   Fase: Go-Live      ████░░░░░░ 35% │
│ ⏸ Empresa 123        ABC: A   Fase: Implantação  ██████░░░░ 50% │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2. Expanded row layout

```
┌──────────────────────────────────────────────────────────────────┐
│ 🟢 Empresa ABC        ABC: A   Fase: Discovery    ████████░░ 72% │
│ │                                                                  │
│ │  ●────●────●────●────●────●────●────●────●                      │
│ │  Disc Disc Val Val  Doc  Trei Go- Pós- Acei                      │
│ │  ov   ov   ida ida  um   nam  Live impl taç                      │
│ │                       ent                                         │
│ │                                                                  │
│ │  Atividades pendentes:                                           │
│ │  ☐ Coletar assinatura do contrato    — vence 20/06              │
│ │  ☐ Agendar treinamento da equipe     — vence 25/06              │
│ │  ☐ Enviar documentação técnica       — vence 30/06              │
│ └──────────────────────────────────────────────────────────────────│
└──────────────────────────────────────────────────────────────────┘
```

### 5.3. Design tokens

Usar o design system existente:
- Navy `#173557` para headers
- Sky `#59c2ed` para indicadores de "em dia"
- Green `#38a169` para progresso alto (>80%)
- Yellow `#d69e2e` para progresso médio (40-80%)
- Red `#e53e3e` para atraso/progresso baixo
- Fonte: Montserrat (já importada globalmente)
- Cards com `bg-bg-primary border-border-tertiary rounded-xl`

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Cliente com onboarding sem fases (zero fases) | Progress = 0, fase atual = "—" |
| Cliente com projeto interno sem milestones | Progress = 0, situação = "Sem milestones" |
| Performance: N+1 queries se listar muitos clientes | Fazer query única com joins + subqueries (Phase 2) |
| Feature flag desativada em produção | Rota não acessível; build não quebra |
| Mudança no schema de fases/milestones | SDD é a fonte da verdade; atualizar data contracts |

---

## 7. Implementation Log

| Phase | Status | Date | Commits | Notes |
|---|---|---|---|---|---|
| 1 — Scaffold + Flag | Done | 2026-06-14 | — | Build ok |
| 2 — Query + Data Layer | Done | 2026-06-14 | — | Build ok; PauseCircle registrado em icons.js |
| 3 — Client Rows + Indicators | Done | 2026-06-14 | — | Build ok; SummaryBar, collapse/expand, sub-rows |
| 4 — Timeline + Activities | Done | 2026-06-14 | — | Build ok; PhaseCircle compacto, atividades, milestones |
