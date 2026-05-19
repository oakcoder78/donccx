
## High-Level Architecture

The application follows a classic front‑end layered structure that mirrors the physical layout of the `src/` directory:

**Pages** – Located under `src/pages/`, each page component represents a top‑level route (e.g., `Dashboard.jsx`, `ProjectsPage.jsx`, `OnboardingDetailPage.jsx`). Pages act as the orchestrators: they import the necessary UI components, invoke domain‑specific hooks, and compose the overall view for a given URL. Navigation is handled by the router defined in `src/App.jsx`.

**Components** – Found in `src/components/`, components are reusable visual building blocks. They are further grouped by functional area (`dashboard/`, `clients/`, `projects/`, `donkie/`, etc.). Components receive data via props and may call local hooks for UI‑specific behavior (e.g., `DonkieButton`, `ActivityModal`). They are assembled by pages to construct the user interface.

**Hooks** – Custom React hooks live in `src/hooks/`. They encapsulate reusable stateful logic such as data fetching (`useProjects`, `useActivities`, `useClients`), domain calculations (`useHealthScore`, `useDonkie`), and side‑effects (e.g., mutation hooks). By abstracting these concerns, hooks keep components thin and promote consistency across the codebase.

**Contexts** – Defined in `src/contexts/`, context providers (e.g., `AuthContext`) expose global state to the component tree. They are mounted at the root of the app (in `App.jsx`) and allow any descendant component or hook to access shared information like the authenticated user or feature flags.

**Lib** – The `src/lib/` folder contains pure utility functions and domain‑specific helpers (`supabaseClient.js`, `openrouterService.js`, `formatPhone.js`, `healthScore.js`). These modules are stateless and can be imported anywhere without pulling in React.

**Services** – Under `src/services/` reside modules that interact with external systems or persistence layers (e.g., `activityAttachments/*`). They perform API calls, file uploads, and database operations, keeping side‑effects isolated from UI code.

**Interaction flow** – A page initiates data fetching via a hook (which may call a service). The hook returns the data and loading state to the page, which passes it to child components for rendering. Components may use additional hooks for local UI state (e.g., open/close toggles). When user actions require persistence, components invoke service functions directly or through mutation hooks, which then communicate with Supabase or external APIs.

This separation of concerns results in a clear dependency direction:

```
Pages → Components → Hooks → Services / Lib
Contexts provide cross‑cutting global state
```

The architecture therefore promotes modularity, testability, and a clean mapping between the physical folder layout and the logical layers of the application.

---

## Path Alias

Since 2026-05-18, all imports use the `@/` alias for `src/`:

```
@/  →  src/
```

This eliminates deep relative imports (`../../../../`) and makes import paths predictable regardless of file depth. Configured in `vite.config.js` with IDE support via `jsconfig.json`.

## Greeting Engine

Located at `src/lib/greeting-engine/`, the Greeting Engine is a deterministic contextual composition system that generates personalized dashboard greetings. It operates entirely client-side with three content layers:

- **Temporal** — time-of-day and day-of-week greetings
- **Identity** — role-based and personal milestone greetings (birthday, anniversary)
- **Operational** — system-state-aware messaging (critical clients, alerts)

The engine follows a composer pattern: `compose.ts` orchestrates content providers from `content/*`, merges fragments deterministically via a seed, and outputs a structured greeting result. Debug/observability output is gated behind `import.meta.env.DEV`.
