# SDD — Donkie Report Context

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for enriching the Donkie AI assistant with report content when the user is on the Report Editor page (`/empresas/:clientId/relatorios/:reportId/editar`). It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

### How to use this document

1. **Before implementing:** Read this document fully — understand the spec, current checkpoint, data contracts, and all phases.
2. **During implementation:** Follow the checklist for the active phase. Tick items as done. Run `npm run build` after each significant change.
3. **After implementation:** Fill the Implementation Log at the bottom of the phase with commit hash, files changed, and technical summary. Update the Checkpoint section.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main`
- **Last deploy:** `donccx.vercel.app`
- **Active phase:** (none — not started)

**What already exists related to this work:**

- `src/hooks/useDonkie.jsx` — `DonkieProvider` with full chat state, `sendMessage`, `buildRouteContext`, `buildSystemPrompt`. Context exposes: `isOpen`, `open`, `close`, `toggle`, `messages`, `isLoading`, `mode`, `toggleMode`, `sendMessage`, `clearConversation`, `clientData`, `setClientData`, `config`, `lastModel`.
- `src/pages/ReportEditorPage.jsx` — Full editor with real-time preview. Computes `sections` (JSONB array via `useState`), `html` (full rendered HTML via `useMemo`), and report metadata (`title`, `period`, `status`).
- Donkie is rendered on all protected pages via `DonkieGuard` in `App.jsx`. Feature flag: `donkie`.
- `buildRouteContext()` at line 353-356: for RMC editor route, returns only `"Usuário está editando um Relatório Mensal (RMC) para {fantasy_name}."`
- API calls use `openrouter-proxy` Edge Function (not the legacy `donkie-chat`).

**What does NOT exist yet:**

- No mechanism for `ReportEditorPage` to pass its sections/HTML to the DonkieProvider
- No `reportExtra` state or setter in `DonkieProvider`
- `buildRouteContext()` doesn't accept or use report content in its RMC context block

### Files to be touched

| File | Change type |
|---|---|
| `src/hooks/useDonkie.jsx` | **Modify** — add `reportExtra` state, export `setReportExtra` from context, update `buildRouteContext()` |
| `src/pages/ReportEditorPage.jsx` | **Modify** — import `useDonkie()`, add `useEffect` to push sections/report data |

---

## 1. Data Contracts

### reportExtra shape

```typescript
interface ReportExtra {
  sections: Section[]       // Full sections array (from ReportEditorPage state)
  title: string             // report.title
  period: string            // report.period (e.g. "2026-05")
  status: 'draft' | 'published'
}
```

Where `Section` is the existing structure used by `reportGenerator.js`:

```typescript
interface Section {
  id: string
  type: string              // 'capa' | 'escala' | 'suporte' | 'projetos' | 'health_score' | 'destaques' | 'contexto' | 'proximos_passos' | 'custom-text' | 'custom-image' | 'custom-metrics' | 'custom-bars'
  title: string
  subtitle?: string
  enabled: boolean
  content: Record<string, any>  // varies by type (text, callout, items, imageUrl, etc.)
  extras: ExtraItem[]
}
```

### Context block format (what goes into the prompt)

When on RMC editor route and `reportExtra` is present:

```
---
RELATÓRIO SENDO EDITADO
Título: {title}
Período: {period}
Status: {status}

SEÇÕES:
1. [✓] Escala da Operação
   Callout: "texto analítico..."
   KPIs: OS 145 | Usuários 32 | Retorno 8.5%

2. [✓] Suporte
   Tickets: 45 abertos, 42 resolvidos
   SLA: 12min

3. [✗] Projetos (desabilitada)

4. [✓] Destaques do Período
   ⭐ Migração concluída: descrição...
   🚀 Nova feature: descrição...
...
---
```

This format gives the AI enough structure to understand what sections exist, what content is already written, and where to make suggestions.

---

## 2. Component / Data Flow

```
ReportEditorPage                          DonkieProvider (useDonkie.jsx)
──────────────                            ──────────────────────────────
sections (useState) ──useEffect─────►     reportExtra (useState)
report (useQuery)         │               setReportExtra ──► exposed in DonkieContext
                          │               buildRouteContext(pathname, clientData, reportExtra)
                          │                 if (rota RMC && reportExtra) ◄──
                          │                   → generates detailed context block
                          │
                          └── cleanup (unmount) → setReportExtra(null)
```

**Key constraint:** `setReportExtra` is called every time `sections` changes (no debounce or max 150ms). This ensures that when `sendMessage()` runs immediately after a keystroke, `reportExtra` already reflects the latest edits — because React batches state updates and processes them before the next event handler.

---

## 3. Implementation Phases

### Phase 1 — reportExtra state + context export

**Status:** Complete

**Rationale:** Foundation primeiro — adicionar o estado e o setter no DonkieProvider antes de qualquer consumidor.

**Scope:**
- Add `reportExtra` state to `DonkieProvider`
- Expose `setReportExtra` via `DonkieContext`
- Export updated type for DonkieContext value

#### Checklist

- [x] **DonkieProvider:** add `const [reportExtra, setReportExtra] = useState(null)` after existing state declarations
- [x] **DonkieContext value:** add `setReportExtra` to the provider value object
- [x] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-20 | *pending* | `src/hooks/useDonkie.jsx` | Add `reportExtra` state + expose `setReportExtra` in DonkieContext |

---

### Phase 2 — ReportEditorPage integration

**Status:** Complete

**Rationale:** Consumidor que vai alimentar o reportExtra. Precisamos garantir que o dado chegue atualizado a cada mudança de sections, sem causar loop de re-render.

**Scope:**
- Import `useDonkie()` in `ReportEditorPage`
- Add `useEffect` to push report data

#### Checklist

- [x] **Import:** `import { useDonkie } from '../hooks/useDonkie'` in `ReportEditorPage.jsx`
- [x] **Destructure:** `const { setReportExtra } = useDonkie()` after existing hooks
- [x] **useEffect:**
  ```js
  useEffect(() => {
    if (!report) return
    setReportExtra({ sections, title: report.title, period: report.period, status: report.status })
    return () => setReportExtra(null)
  }, [sections, report?.title, report?.period, report?.status])
  ```
- [x] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-20 | *pending* | `src/pages/ReportEditorPage.jsx` | Import `useDonkie`, add `useEffect` to push sections to Donkie on every change |

---

### Phase 3 — Context formatting in buildRouteContext

**Status:** Complete

**Rationale:** Coração da feature — transformar o reportExtra em um bloco de contexto rico que o AI entenda. A formatação precisa ser compacta (economizar tokens) mas informativa o suficiente pra gerar sugestões precisas.

**Scope:**
- Modify `buildRouteContext()` to accept `reportExtra` parameter
- Generate detailed context block when on RMC route with data

#### Checklist

- [x] **Signature:** change `buildRouteContext(pathname, clientData)` to `buildRouteContext(pathname, clientData, reportExtra)`
- [x] **RMC route handler:** when `reportExtra` is provided, replace single-line with multi-line block with title, period, status + all sections
- [x] **Section formatting helper:** `formatSectionForContext(section)` — handles all 11 section types
- [x] **Update callers:** both `sendMessage` call sites pass `reportExtra` as third argument
- [x] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-20 | *pending* | `src/hooks/useDonkie.jsx` | Add `formatSectionForContext` helper, update `buildRouteContext` signature + RMC handler, update both callers |

---

## 4. Current Checkpoint

### Production state

- Donkie now receives full report content (sections, title, period, status) when user is on Report Editor page
- Context includes all enabled/disabled sections with their textual content, KPIs, timeline items, and next steps
- `buildRouteContext()` generates a structured block with all sections formatted per type
- Back button context (`navigate(-1)`) deployed (commit `206c833`)
- Docs updated to reflect back button behavior (commit `f66c9a9`)

### Architectural decisions

| Decision | Rationale |
|---|---|
| `reportExtra` como state interno do DonkieProvider | Evita criar um contexto separado; DonkieProvider já é o centro de toda lógica do Donkie. Um contexto extra aumentaria complexidade sem benefício. |
| Seções passadas como objeto estruturado, não HTML | HTML tem muito noise (tags, atributos, estilos). Seções em formato estruturado são mais compactas e semanticamente mais ricas pro AI. O HTML preview pode ser adicionado depois se necessário. |
| Sem debounce no `setReportExtra` ou máximo 150ms | Garante que o state React esteja sempre atualizado no momento do `sendMessage`. Debounce >0 poderia causar race condition se usuário digitar e clicar em enviar rapidamente. |

---

## 5. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js`.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in the Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** all work goes directly to `main`.
- **DonkieProvider wraps AppLayout via DonkieGuard:** any page inside the Outlet (including ReportEditorPage) has access to `useDonkie()`. Não precisa de provider adicional.
- **`buildRouteContext` is called in two places** in `sendMessage` (lines 497 and 542 in current file). Both must receive `reportExtra`. If only one is updated, the other code path will lack context.
- **Cleanup on unmount:** `useEffect` return must call `setReportExtra(null)`. If user navigates away from editor while Donkie is open, stale report data must not persist.

---

## 6. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — understand what exists and what will be touched.
2. Start with **Phase 1** — it has no dependencies.
3. Proceed to **Phase 2** — consumes Phase 1's exposed setter.
4. End with **Phase 3** — consumes Phase 2's data.
5. After each phase, run `npm run build` and fill the Implementation Log.
6. At the end, update the **Checkpoint** section with the new state.

### Technical Summary Template (fill at the end of each phase)

```
### Technical Summary — Phase N

**Commits:** hash
**Files modified:** [list]

**Decisions:**
- [decision and rationale]

**Issues found:**
- [problem and solution]

**Pending items:**
- [items not covered]
```

---

## Validation checklist

- [ ] Section 0 reflects actual current state of the codebase
- [ ] `reportExtra` field names match real column/prop names in `useDonkie.jsx` and `ReportEditorPage.jsx`
- [ ] Both `sendMessage` code paths pass `reportExtra` to `buildRouteContext`
- [ ] Cleanup `setReportExtra(null)` present in Phase 2 useEffect
- [ ] Gotchas section includes project-wide traps
- [ ] Language convention followed (English for instructions/code, Portuguese for rationale)
