# Module — Pages

## Purpose
The **Pages** module groups the top‑level UI screens of the application. Each file in `src/pages/` exports a React component that represents a distinct route rendered by the router defined in `src/App.jsx`. These screens provide the main user‑facing flows – authentication, onboarding, dashboard, ticket creation, report editing and public view, as well as auxiliary pages for password reset and access requests. They orchestrate navigation, embed core UI components, and act as entry points for data loading and actions that affect the rest of the system.

## Responsibilities
- Define the primary route components of the SPA.
- Load and coordinate data required for each view (e.g., client lists, activity data, Freshdesk config, Supabase session).
- Compose reusable UI components from `src/components/` and icons from `src/lib/icons`.
- Integrate with context providers (`AuthContext`, custom hooks) for authentication and shared state.
- Control access to public vs. private screens (Login, ResetPassword, SolicitarAcesso are public; Dashboard, AtendimentoPage, Report* pages are protected).
- Trigger side‑effects such as API calls, Supabase queries, or Edge Function invocations.

## Module Structure
- **AtendimentoPage.jsx** – multi‑step wizard for creating Freshdesk tickets from WhatsApp conversations.
- **CockpitsPage.jsx** – gateway page at `/cockpits` with cards linking to Health Score and CS Radar.
- **CsRadarPage.jsx** – CS Radar dashboard (activities, RMCs, project progress) — complete with filters, charts, heatmap, and client table.
- **Dashboard.jsx** – main overview screen showing health scores, client signals, and recent activities.
- **DoncAPIPendentes.jsx** – list of pending items specific to the internal "Donc API" integration.
- **FreshdeskPendingPage.jsx** – view of pending Freshdesk tickets awaiting action.
- **LoginPage.jsx** – authentication page that signs the user in via Supabase.
- **OnboardingDetailPage.jsx** – detailed onboarding view for a selected client or user.
- **PendingPage.jsx** – generic pending‑tasks overview aggregating various queues.
- **PrimeiroAcesso.jsx** – first‑access flow for new users to set up their profile.
- **ReportEditorPage.jsx** – UI for creating or editing internal reports.
- **ReportPublicPage.jsx** – public‑facing rendering of a report, reachable without authentication.
- **ResetPasswordPage.jsx** – page that allows a user to reset a forgotten password.
- **SolicitarAcessoPage.jsx** – form for requesting access to the system.

## UI Architecture
Pages are plain React components that import shared UI primitives (`Spinner`, `ActivityDetailModal`, form fields, icons) and layout utilities. Navigation is handled by `react‑router‑dom`; each page is rendered at a distinct route path (e.g., `/dashboard`, `/login`). Pages compose higher‑level components (cards, tables, step wizards) and manage their own local state with React hooks. Protected pages guard their content by checking `useAuth()` for a valid Supabase session.

### Dashboard Layout (`Dashboard.jsx`)

> **Dashboard v3 is live (2026-08-30).** `/dashboard` routes through `src/pages/DashboardRoute.jsx`,
> which now renders the block-based **Dashboard v3** (`src/pages/MeuDiaV3Page.jsx`) for **all 6 roles**
> — the `dashboard_v3` flag is `{all roles}` + `enabled=true`, kept only as a DB kill-switch
> (`enabled=false` → the monolith below, for everyone, no deploy). The monolith lives at
> `/labs/dashboard` under `AdminOnlyRoute` (admin only). See `docs/modules/meu-dia-dashboard.md` and
> the SDD `docs/sdd/labs-dashboard-sdd.md` (single source of truth). **The layout described below is
> the monolith** (`/labs/dashboard`); the v3 layout is in the module doc.

The dashboard is organized into **4 visual strips (faixas)**:

| Strip | Background | Content |
|-------|-----------|---------|
| **1 — Pulso** | Dark navy | User identity + greeting, MRR display (R$ X.Xk/mes + ARR + Em atraso), counter cards (Sem interacao, Onboardings atrasados, Temperaturas vencidas) |
| **2 — Urgencias** | Gray | Alertas prioritarios (top 5 urgency-scored clients) + Proximas atividades (7 dias) |
| **3 — Portfolio** | White | Saude rankeada (top 10 with score bars) + Saude por dimensao (5 dimension progress bars) + Sem interacao recente |
| **4 — Operacional** | Gray | OS criadas / Profissionais ativos / Health score — variacao mensal (top 5 clients each) + Sincronizacao de dados |

**Operational cards** (Faixa 4) use helper functions:
- `opAnchor(x)` — builds anchor text: "mai 398 OS · jun 17 OS"
- `OpDeltaBadge({x})` — renders delta badge: absolute delta ("▲ +381 OS") with neutral state for new clients ("Inicio de uso" when prevVal < 10)
- `buildOpCountRows(opsByClient, clients, valOf, unit)` — builds comparison rows sorted by absolute delta descending

An **overlay drawer** (`DrawerClientContent`) renders client details when a client is clicked from any strip. ESC or overlay click closes it.

## Data Flow
- **Loading**: Pages use `react‑query` (`useQuery`) or custom hooks (`useClients`, `useActivities`, `useHealthConfig`, etc.) to fetch data from Supabase tables or Edge Functions.
- **Mutation**: Actions such as ticket creation (`AtendimentoPage`) or health recalculation (`Dashboard`) call Supabase RPCs or fetch Edge Functions, then update local caches or write back to tables.
- **State Sharing**: Auth and profile information come from `AuthContext`. Hooks expose shared state (clients, profiles, health config) across pages.
- **Submission**: Forms collect user input, construct payload objects, and post them via `fetch` to Supabase Function endpoints.

## Dependencies
- **components/** – UI pieces like `ActivityDetailModal`, `Spinner`.
- **hooks/** – data‑fetching hooks (`useClients`, `useActivities`, `useHealthConfig`, etc.).
- **contexts/** – `AuthContext` for authentication state.
- **lib/** – utilities (`supabaseClient`, `icons`, `gravidade`, `openrouterService`, `freshdeskConfig`).
- **@tanstack/react-query** – data fetching and caching.
- **react‑router‑dom** – routing.
- **react‑hot‑toast** – user notifications.

## Integration Points
- **Supabase** – authentication, DB queries, and edge function calls.
- **Freshdesk** – ticket creation and configuration retrieval.
- **OpenRouter** – AI analysis of WhatsApp text in `AtendimentoPage`.
- **Clients / Activities / Milestones** – core business entities displayed on the dashboard and used throughout the app.
- **Reports** – report editing and public rendering.
- **Onboarding** – client onboarding flow.

## Main User Flows
1. **Login** – user accesses `/login`, authenticates via Supabase, session stored in `AuthContext`.
2. **Dashboard Access** – after login, router redirects to `/dashboard`, showing health scores and client signals.
3. **Create Ticket** – from the dashboard or a direct link, user opens `/atendimento`, follows a three‑step wizard to select a client, paste WhatsApp text, optionally run AI analysis, review fields, and create a Freshdesk ticket.
4. **View/Edit Report** – authenticated users navigate to `/report/edit/:id` (`ReportEditorPage`) to modify a report; public viewers use `/report/:id` (`ReportPublicPage`).
5. **Request Access** – prospective users fill `/solicitar-acesso` (`SolicitarAcessoPage` inserts `access_requests {name,email,status:'pending'}` after dedup against `profiles`/`access_requests`; no `auth` creation) → admin approves in `SettingsUsers` (`ApproveModal` → `invite-user` → `auth.users` + `profiles invited/active`).
6. **Direct Invite** – admin fills `SettingsUsers` → `Convidar` (`InviteUserModal` `Nome*/E-mail*/Perfil`) → `POST /functions/v1/invite-user` (invite-first, no pre-insert into `profiles`; fixed `2026-08-28` `400 null value in column "id"`); `profiles` created by `handle_new_user` + Edge `upsert invited`; invite email to `https://donccx.vercel.app/primeiro-acesso`.
7. **Password Reset** – `/reset-password` allows password recovery via Supabase.
8. **First‑Access Setup** – new users (`status invited|pending`) complete `/primeiro-acesso` (`PrimeiroAcesso.jsx:78` `auth.updateUser({password})` + `upsert profiles {id:user.id, status:'active'}` + `update access_requests status='approved'` + `signOut` → `/login`).

## State Management
- Local component state via `useState` for form fields, step control, and UI flags.
- Global auth state via `AuthContext` (`useAuth`).
- Data fetching caches via `react‑query` (`useQuery`).
- Custom hooks expose domain‑specific caches (clients, activities, health config, milestones).
- Refs (`useRef`) used for stable callbacks in OCR handling and step‑wise form patches.

### DoncAPIPendentes Notes

- **Bulk confirm modal:** the ternary inside `<p>` evaluates `confirmAction.count` without optional chaining on the else branch. Fixed 2026-07-01: `confirmAction?.count ?? 0`.

## Known Risks
- Heavy coupling between pages and many internal hooks can make isolated testing difficult.
- Several pages perform side‑effects (fetches, Supabase writes) directly in component bodies; errors may surface as UI glitches.
- The ticket‑creation flow mixes UI state with external API calls, potentially causing inconsistent UI if a request fails.
- Public pages (`ReportPublicPage`) must ensure no sensitive data leaks from context.

## Future Improvements
- Extract common layout (header, navigation bar) into a shared component to reduce repetition.
- Move data‑fetching logic into dedicated service layers or Redux‑style stores for clearer separation.
- Add TypeScript typings or PropTypes for page component props.
- Implement error‑boundary wrappers around each page to gracefully handle runtime failures.
- Consolidate route definitions and lazy‑load pages for improved bundle size.

## File Reference Map
- `src/pages/AtendimentoPage.jsx`
- `src/pages/CockpitsPage.jsx`
- `src/pages/CsRadarPage.jsx`
- `src/pages/Dashboard.jsx`
- `src/pages/DoncAPIPendentes.jsx`
- `src/pages/FreshdeskPendingPage.jsx`
- `src/pages/LoginPage.jsx`
- `src/pages/OnboardingDetailPage.jsx`
- `src/pages/PendingPage.jsx`
- `src/pages/PrimeiroAcesso.jsx`
- `src/pages/ReportEditorPage.jsx`
- `src/pages/ReportPublicPage.jsx`
- `src/pages/ResetPasswordPage.jsx`
- `src/pages/SolicitarAcessoPage.jsx`
