# Deployment Context

Description of the environment where the application runs and how the infrastructure resources interconnect.

---

## Frontend

- **Technology:** React 18 application built with Vite.
- **Execution:** JavaScript/HTML/CSS code runs in the user's browser.
- **Build:** `npm run build` generates static assets (JS, CSS, images) that are served via a CDN or cloud platform.
- **Hosting:** Typically deployed on Vercel (or another static hosting platform), where the bundle is served as an SPA.
- **Purpose:** Provides the entire UI, interaction logic, local state management, and initiates calls to external APIs.

---

## Backend (BaaS)

- **Platform:** Supabase provides Backend‑as‑a‑Service.
- **Responsibilities:** Authentication (Auth), auto‑generated REST API, Realtime, Edge functions.
- **CRUD Operations:** All create, read, update, delete actions for entities (clients, projects, activities, contacts, etc.) are performed through the Supabase client.
- **Session:** Supabase manages user sessions via JWT; the frontend includes the token in requests.
- **Note:** There is no custom Node/Express backend; business logic that requires custom code lives in Edge functions or the frontend `services` layer.

---

## Database

- **Type:** PostgreSQL managed by Supabase.
- **Entities:**
  - `clients`
  - `projects`
  - `activities`
  - `contacts`
  - `settings`
  - `health_data`
- **Usage:** Persistent storage of domain information. Migrations are version‑controlled in `supabase/migrations` and applied via `supabase db push`.

---

## File Storage

- **Service:** Supabase Storage (configured bucket).
- **Purpose:** Store attachment files uploaded by users, such as documents or images linked to activities.
- **Access Layer:** Implemented in `src/services/activityAttachments/`, which uses the Supabase client for upload, download, and deletion of files.

---

## External Services

- **Freshdesk:** Support system. Integration is performed through `src/lib/freshdeskSync.js` and `src/lib/freshdeskConfig.js`, which handle communication with the Freshdesk API and data synchronization.
- **Donc API:** External API that provides partner operational data. Configured via the Settings module and accessed by utility functions located in the `lib` layer.
- **OpenRouter (Donkie):** AI service providing language models. Implemented via `src/lib/openrouterService.js` and used by components and services that require assisted functionality.

---

## Environment Configuration

- **Storage:** Variables defined in `.env.local` (or `.env`).
- **Key variables:**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `FRESHDESK_API_KEY`
  - `FRESHDESK_DOMAIN`
  - `DONC_API_URL`
  - `OPENROUTER_API_KEY`
- **Usage:** These variables are read by the Supabase client and by `lib` modules that make external service calls. Missing any variable causes initialization failure.

---

## Summary

The architecture follows the flow:

```
Frontend (React) → Supabase (Auth, DB, Storage) → External APIs (Freshdesk, Donc, OpenRouter)
```

- The frontend directly consumes Supabase via `supabaseClient`.
- External services are accessed through the `lib` and `services` layers, keeping the UI decoupled from integrations.
- Sensitive configurations are managed via environment variables, ensuring the same codebase works across development, testing, and production environments.
