# Integration Points

This document lists external integration points in the application, indicating where each integration occurs and which modules depend on it.

## Supabase

- **External system:** Supabase (PostgreSQL + Auth + Storage).
- **Purpose:** Primary database storing domain entities – clients, projects, activities, contacts and authentication‑related data.
- **Dependent modules:** Hooks such as `useClients`, `useProjects`, `useActivities`, `useContacts`, `useSegments` and `useStages`, which use the `supabaseClient` directly or via the `services` layer.
- **Communication location:** Centralized in the Supabase client defined at `src/lib/supabaseClient.js`. Hooks access this client directly or indirectly through the `services` layer.

---

## Freshdesk

- **External system:** Freshdesk – support and ticket‑management platform.
- **Purpose:** Sync ticket data and support events with the system, enabling operational information to be used in analytics, reports and client tracking.
- **Dependent modules:** Utility functions in the `lib` layer, such as `freshdeskSync.js` and `freshdeskConfig.js`, plus hooks and components that display or consume Freshdesk data.
- **Communication location:** Implemented via utility functions located in `src/lib/freshdeskSync.js` and `src/lib/freshdeskConfig.js`, which perform HTTP calls to the Freshdesk API.

---

## Donc API

- **External system:** External API of the Donc platform, used for integration with partner systems.
- **Purpose:** Enable communication with external services related to operations, such as data synchronization or external information lookup.
- **Dependent modules:** Components and hooks that need to access external data configured through the Settings module.
- **Communication location:** Implemented via utility functions in the `lib` layer, configured through the Settings module and used by hooks or components that depend on external data.

---

## OpenRouter (Donkie)

- **External system:** OpenRouter – AI service providing language models (ChatGPT, Claude, etc.).
- **Purpose:** Power assisted features, text generation and intelligent automation within the application.
- **Dependent modules:** The *Donkie* sub‑module (`src/donkie/`) contains wrappers that call the OpenRouter API; some *services* that need AI responses and *hooks* that manage the call state.
- **Communication location:** Implemented in `src/lib/openrouterService.js` (or similar) inside the *Donkie* layer; AI services import this client.

---

## File Storage (Attachments)

- **External system:** Supabase Storage (or configured bucket for file storage).
- **Purpose:** Store files attached to activities, such as documents, images and operational evidence.
- **Dependent modules:** Services located in `src/services/activityAttachments/`, used by hooks and components responsible for displaying, creating or removing activity attachments.
- **Communication location:** Implemented through the `services/activityAttachments/` layer, which uses the `supabaseClient` to upload, download and delete stored files.

---

**Summary:** External integrations are centralized in the `lib`, `services` and `hooks` layers, with global configurations stored in *settings*. Each integration point has a clear purpose and provides data or functionality consumed by various parts of the application, ensuring a coherent and decoupled data flow.
