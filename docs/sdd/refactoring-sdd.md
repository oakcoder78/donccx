# SDD — Refatoração do doncCX Hub

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the ongoing codebase refactoring of the doncCX Hub. It is designed to be read by both humans and LLM agents so that work can be resumed across sessions without external context.

### How to use this document

1. **Before implementing:** Read this document fully — understand the rationale, current checkpoint, and active phase checklist.
2. **During implementation:** Follow the checklist for the active phase. Tick items as done.
3. **After implementation:** Fill the Implementation Log, update the Checkpoint section.

---

## 0. Contexto e Motivação

O projeto doncCX Hub acumulou débito técnico ao longo do desenvolvimento acelerado de features. Este SDD organiza uma refatoração estruturada em fases independentes, priorizando impacto sem risco.

**Diagnóstico original (maio/2026):**
- 350+ chamadas diretas `supabase.from()` em componentes — sem cache, sem re-uso, lógica duplicada
- Imports com paths relativos profundos (`../../../../`) em arquivos de `clients/tabs/operacional/`
- Console.logs de debug espalhados em produção
- Imports diretos de `lucide-react` violando o padrão de `src/lib/icons.js`
- Componentes gigantes: `OnboardingDetailPage` com ~1.944 linhas
- `minify: false` no build de produção (possivelmente intencional — não alterar sem validar)

**Ordem de execução decidida:**

| Fase | Escopo | Quando |
|---|---|---|
| **Fase 1** | Limpeza: alias `@/`, console.logs, imports lucide, dead code | ✅ Concluída |
| **Fase 2** | Service layer + hooks TanStack (base para tudo) | Próxima fase ativa |
| **Fase 3** | Quebrar componentes gigantes | Após módulo Onboarding estabilizar |
| **Fase 4** | Inline styles → Tailwind | Paralela às outras |
| **Fase 5** | TypeScript + testes | Quando produto estabilizar |

> **Fase 2 (service layer) foi renomeada internamente do plano original — no plano era "Fase 3".** A numeração deste SDD reflete a ordem de execução real, não o plano original.

---

## 1. Current System State

- **Active branch:** `main` (worktree disabled — all work goes directly to main)
- **Last deploy:** `donccx.vercel.app`
- **Active phase:** Phase 2 — Service Layer (Phase 1 is complete)

**Audit realizada em maio/2026 — estado verificado:**

| Item | Status | Detalhe |
|---|---|---|
| Path alias `@/` em `vite.config.js` | ✅ Configurado | `resolve.alias: { '@': path.resolve(__dirname, './src') }` |
| Path alias `@/` em `jsconfig.json` | ✅ Configurado | `paths: { "@/*": ["src/*"] }` |
| Arquivos profundos usando `@/` | ✅ Adotado | Sem `../../../../` residual |
| Console.logs de debug | ✅ Limpos | 2 arquivos, 4 logs — todos condicionados a `isDebugEnabled()` ou prefixados, nenhum solto |
| Imports diretos de `lucide-react` | ✅ Zero violações | Apenas `src/lib/icons.js` importa de lucide (correto) |
| Dead code / arquivos órfãos | ✅ Removidos | 7 arquivos deletados; BrazilMap mantido |
| `minify: false` | ✅ Mantido intencionalmente | Não alterar sem validar motivo |

---

## 2. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js`.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in the Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main`.
- **minify: false:** mantido intencionalmente no `vite.config.js`. Não remover sem entender e validar o motivo com o time.
- **Onboarding module:** `OnboardingDetailPage` está em desenvolvimento ativo — novas funcionalidades ainda sendo adicionadas. Não quebrar em sub-componentes enquanto o módulo não estabilizar.

---

## 3. Implementation Phases

---

### Phase 1 — Cleanup

**Status:** Concluída.

**O que foi feito:**
- ✅ Path alias `@/` configurado em `vite.config.js` e `jsconfig.json`
- ✅ Arquivos profundos migrados para `@/` — sem `../../../../` residual
- ✅ Console.logs de debug removidos ou condicionados a `isDebugEnabled()`
- ✅ Zero imports diretos de `lucide-react` fora de `src/lib/icons.js`
- ✅ Dead code deletado (7 arquivos) — BrazilMap mantido

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-19 | — | 7 removidos | Drawer, VersionBadge, SettingsPageContainer, SettingsPageHeader, SettingsTabHeader, SettingsTabs, ClientSubOnboarding deletados. BrazilMap mantido. Build verificado. |

---

### Phase 2 — Service Layer + TanStack Hooks

**Status:** Not started — this is the active phase.

**Rationale:** 350+ chamadas diretas `supabase.from()` espalhadas em componentes causam bugs de cache difíceis de rastrear, re-renders desnecessários e lógica de query duplicada. Centralizar em hooks TanStack Query é o que vai dar base sólida para Onboarding, QBR, alertas e qualquer feature futura.

**Scope:**
- Criar service functions em `src/services/` para as entidades mais críticas
- Wrappear em hooks TanStack Query em `src/hooks/`
- Migrar os componentes de maior impacto para usar os hooks
- Não é necessário migrar 100% de uma vez — migrar por entidade, começando pelas mais usadas

#### Approach

**Step 1 — Inventory:** antes de implementar, mapear quais entidades têm mais chamadas diretas e quais componentes as fazem. Priorizar pelas mais duplicadas.

**Entidades candidatas a priorizar (baseado no diagnóstico original):**

| Entity | Tables | Likely callers |
|---|---|---|
| Clients | `clients`, `client_catalog`, `client_usage` | `ClientsPage`, `DashboardPage`, `ClientDetail`, hooks dispersos |
| Activities | `activities`, `activity_attachments` | `ActivitiesPage`, `ClientTabActivities`, `DashboardPage` |
| Contacts | `contacts`, `contact_links`, `contact_phones` | `ContactsPage`, `ClientTabContacts` |
| Projects | `projects`, `milestones`, `tasks` | `ProjectsPage`, `ClientTabProjetos` |
| Health | `health_config`, `health_rules` | `SettingsHealth`, `ClientTabHealth`, `DashboardPage` |

**Step 2 — Pattern to follow:**

```js
// src/services/clients.js
export async function fetchClients(filters = {}) {
  const query = supabase
    .from('clients')
    .select(`id, name, fantasy_name, health_total, ...`)
    .eq('contract_active', true)
  if (filters.csm_id) query.eq('csm_id', filters.csm_id)
  if (filters.search) query.ilike('fantasy_name', `%${filters.search}%`)
  const { data, error } = await query
  if (error) throw error
  return data
}

// src/hooks/useClients.js
import { useQuery } from '@tanstack/react-query'
import { fetchClients } from '../services/clients'

export function useClients(filters, options = {}) {
  return useQuery({
    queryKey: ['clients', filters],
    queryFn: () => fetchClients(filters),
    staleTime: 30 * 1000,
    ...options,
  })
}
```

> **Atenção:** alguns hooks `useClients`, `useActivities`, etc. já existem no projeto. Antes de criar novos, verificar o que já existe em `src/hooks/` e refatorar em vez de duplicar.

**Step 3 — Migration:** para cada entidade, substituir as chamadas diretas `supabase.from()` nos componentes pelo hook correspondente. Fazer por entidade, uma de cada vez, com build de verificação após cada uma.

#### Checklist — Phase 2

- [ ] **Audit existing hooks:** listar todos os arquivos em `src/hooks/` e mapear quais entidades já têm hooks vs. chamadas diretas no componente
- [ ] **Clients service + hook:** consolidar `fetchClients` em `src/services/clients.js`, refatorar `useClients` se necessário
- [ ] **Activities service + hook:** consolidar, refatorar `useActivities`
- [ ] **Contacts service + hook:** consolidar, refatorar `useContacts`
- [ ] **Projects service + hook:** consolidar, refatorar `useProjects`
- [ ] **Health service + hook:** consolidar `useHealthConfig`, `useHealthScore`
- [ ] **Build:** `npm run build` after each entity migration

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 3 — Break Down Giant Components

**Status:** Planned — do not start before Phase 2 is complete AND Onboarding module is stable (no active feature development).

**Rationale:** Componentes com 1000+ linhas são difíceis de debugar, impossíveis de testar unitariamente e geram conflitos de merge. Quebrar em sub-componentes melhora manutenibilidade e permite testes isolados.

**Candidates identified:**

| File | Approx. lines | Priority |
|---|---|---|
| `src/pages/OnboardingDetailPage.jsx` | ~1.944 | High — wait for active development to cease |
| `src/components/dashboard/DashboardPage.jsx` | High (estimate) | Medium |
| `src/pages/ReportEditorPage.jsx` | High (estimate) | Medium |

> **Regra:** não iniciar esta fase antes de confirmar que `OnboardingDetailPage` não está mais em desenvolvimento ativo. A migration 028 já foi aplicada — o bloqueio é de feature, não de schema.

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 4 — Inline Styles → Tailwind

**Status:** Planned — can run in parallel with Phase 2 or 3, file by file.

**Rationale:** O projeto mistura inline `style={{}}` com Tailwind. A inconsistência torna o design system difícil de manter e temas impossíveis de aplicar globalmente.

**Approach:** Migrar por componente, começando pelos menores. Não reescrever — extrair para classes Tailwind equivalentes. Não alterar comportamento visual, apenas a forma de declarar os estilos.

> **Atenção:** `DashboardPage.jsx` usa um objeto `C` com constantes de cor inline que são usadas programaticamente (ex: `color: scoreBandColor(score)`). Esses não podem ser migrados para Tailwind diretamente — precisam de variáveis CSS ou permanecer inline. Não forçar migração onde a lógica de cor é dinâmica.

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 5 — TypeScript + Tests

**Status:** Future — do not start while product is still in active feature development.

**Rationale:** Migrar para TypeScript durante construção ativa adiciona atrito em cada nova feature. Testes unitários dependem de hooks estáveis (Phase 2 primeiro). Ambos fazem mais sentido quando o produto estabilizar.

**Pre-requisites:**
- Phase 2 (service layer) completa — hooks existem e são estáveis
- Ritmo de novas features diminuiu — produto em modo de refinamento

---

## 4. Current Checkpoint

### Estado resumido

- Fase 1: 100% concluída. 7 arquivos órfãos removidos, BrazilMap mantido intencionalmente.
- Fase 2: não iniciada. É a próxima a executar.
- Fases 3, 4, 5: planejadas, aguardando pré-requisitos.

### Architectural decisions registered

| Decision | Rationale |
|---|---|
| Fase 2 antes da Fase 3 | Service layer dá base para tudo; quebrar componentes sem hooks é retrabalho duplo |
| OnboardingDetailPage bloqueada enquanto módulo estiver em dev ativo | Migration 028 já aplicada; o bloqueio é de feature — novas funções ainda sendo adicionadas; quebrar agora = refatorar duas vezes |
| `minify: false` mantido | Provavelmente intencional para debug no Vercel; não alterar sem entender o motivo |
| TypeScript adiado | Produto em construção ativa; atrito > benefício agora |
| Migração por entidade, não big bang | Menos risco; build de verificação após cada entidade |

---

## 5. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Contexto)** and **Section 1 (Current System State)** first.
2. Identify the **active phase** — currently **Phase 2**.
3. Phase 1 is complete — no pending items.
4. For Phase 2: start with the audit of existing hooks before writing any new code.
5. Implement one entity at a time. Run `npm run build` after each.
6. Fill the **Implementation Log** at the end of each phase.
7. Update **Section 4 (Checkpoint)** with the new state.

### Technical Summary Template (fill at the end of each phase)

```
### Technical Summary — Phase X

**Commits:** hash1, hash2
**Files created:** [list]
**Files modified:** [list]
**Files deleted:** [list]

**Decisions:**
- [decision and rationale]

**Issues found:**
- [problem and solution]

**Pending items:**
- [items not covered or deferred]
```
