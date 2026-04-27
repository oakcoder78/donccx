# System Overview

This document serves as a central navigation point for the architectural documentation of **doncCX Hub**, linking all technical guides produced so far.

---

## Recommended Reading Order

Read the documents below in this sequence to gain a complete understanding of the structure, flows, and architectural decisions:

1. **System Purpose**
   - `docs/system/system-purpose.md`
   - Overview of goals, target users and operational objectives.
2. **High-Level Architecture**
   - `docs/system/high-level-architecture.md`
   - Conceptual diagram of the main layers (Frontend, BaaS, External Services).
3. **Core Modules**
   - `docs/system/core-modules.md`
   - Description of core modules that implement business logic.
4. **Shared Modules**
   - `docs/system/shared-modules.md`
   - Reusable modules (UI, Layout, Hooks, Contexts, Lib, Services, Donkie).
5. **Data Flow**
   - `docs/system/data-flow.md`
   - How data travels from UI to persistence and back.
6. **Integration Points**
   - `docs/system/integration-points.md`
   - Integration points with Supabase, Freshdesk, Donc API, OpenRouter and Storage.
7. **Deployment Context**
   - `docs/system/deployment-context.md`
   - Where the system runs, infrastructure details and environment variables.
8. **Future Architecture**
   - `docs/system/future-architecture.md`
   - Possible evolutions, optimizations and growth strategies.

---

## Modules Reference

Individual system modules are detailed in the `docs/modules/` folder. Each module includes usage examples, public API and maintenance notes.

```text
/docs/modules/
│   ui.md                # Reusable interface components
│   layout.md            # Layout structures and responsiveness
│   hooks.md             # Custom React hooks
│   contexts.md          # Global state providers
│   lib.md               # Low‑level utility libraries
│   services.md          # External communication abstractions
│   donkie.md            # AI and automation tools
```

---

## How to Contribute

- Update the document corresponding to any module you modify.
- Keep the recommended reading order.
- Use `##` headers for new sections and `-` for lists.
- Do not introduce new dependencies without reflecting the change in `Integration Points` or `Deployment Context` documentation.

---

**Overview:**

```
Frontend (React) → Supabase (BaaS) → External APIs (Freshdesk, Donc, OpenRouter)
```

This chain reflects the current architecture; the documents above elaborate each link.
