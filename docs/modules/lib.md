# Module — Lib

## Purpose
Utility library. Centralizes pure functions, API wrappers, constants, and helpers used across UI and hooks. Provides consistent access to Supabase client, formatting, external services (Freshdesk, OpenRouter), and business‑logic calculations (gravidade, health score, billing). Decouples core logic from React components.

## Responsibilities
- Export Supabase client instance with auth handling.
- Wrap external APIs (Freshdesk config/sync, OpenRouter AI, billing service).
- Provide data‑formatting helpers (phone formatter, icons map).
- Implement domain calculations (gravidade, healthScore).
- Sync client data between Supabase and external sources.
- Supply static label maps for onboarding steps.

## Module Structure

| File | Role |
|------|------|
| `billing.js` | Functions to calculate invoice amounts, apply taxes/discounts. |
| `clientSync.js` | Sync client records between Supabase and external system; resolve conflicts. |
| `formatPhone.js` | Normalize Brazilian phone numbers, add mask. |
| `freshdeskConfig.js` | Load Freshdesk ticket config (groups, agents, custom fields). |
| `freshdeskSync.js` | Push/update tickets, fetch status from Freshdesk edge function. |
| `gravidade.js` | Compute gravidade score from activity metrics. |
| `greeting-engine/` | Deterministic greeting composition system (see below). |
| `healthScore.js` | Aggregate client health dimensions into total score. |
| `icons.js` | Export SVG path data map for UI icons. |
| `onboardingLabels.js` | Map onboarding step IDs to human‑readable labels. |
| `openrouterService.js` | Call OpenRouter LLM endpoint, return analysis result. |
| `reportGenerator.js` | Assemble PDF/HTML report from data payloads. |
| `supabaseClient.js` | Initialise Supabase JS client, expose `supabase` object. |
| `supportUtils.js` | Misc helpers (error formatting, date utils). |

### Greeting Engine (`greeting-engine/`)

| File | Role |
|------|------|
| `compose.ts` | Main orchestrator — assembles fragments from all layers |
| `content/temporal.ts` | Time-of-day and day-of-week phrase provider |
| `content/identity.ts` | Role-based and milestone phrase provider |
| `content/operational.ts` | System-state-aware phrase provider |
| `seed.ts` | Deterministic seed generation from user ID + timestamp |
| `types.ts` | TypeScript interfaces for fragments, context, results |
| `debug.ts` | Debug flag configuration |
| `observability.ts` | DEV-only structured debug output |
| `hooks/useGreeting.ts` | React hook for consuming the engine in components |

## Data Flow
- **Supabase**: `supabaseClient.js` creates client; other lib files import it for CRUD or RPC calls.
- **External APIs**: `openrouterService.js`, `freshdeskConfig.js`, `freshdeskSync.js` perform `fetch` calls to remote endpoints, return parsed JSON.
- **Calculations**: `gravidade.js` and `healthScore.js` accept raw DB rows, output numeric scores used by hooks/pages.
- **Formatting**: `formatPhone.js`, `icons.js`, `onboardingLabels.js` return deterministic values for UI rendering.

## Dependencies
- `@supabase/supabase-js` (via `supabaseClient.js`)
- Native `fetch` for HTTP calls
- No UI libraries; pure JS modules.

## Integration Points
- **Hooks** (`useActivities`, `useHealthScore`, etc.) import lib helpers for queries and calculations.
- **Pages/Components** (`ProjectModal.jsx`, `AtendimentoPage.jsx`) use icons, formatPhone, reportGenerator.
- **Backend sync** (`clientSync.js`, `freshdeskSync.js`) invoked from edge functions or admin tools.

## Main Usage Patterns
```js
import { supabase } from '@/lib/supabaseClient';
import { formatPhone } from '@/lib/formatPhone';
import { getFreshdeskConfig } from '@/lib/freshdeskConfig';
import { calculateGravidade } from '@/lib/gravidade';

// Example: fetch client, format phone, compute gravidade
const { data } = await supabase.from('clients').select().eq('id', id).single();
const phone = formatPhone(data.phone);
const grav = calculateGravidade(data.activities);
```

## State Management
Stateless pure functions; no internal React state. Some modules maintain in‑memory caches (e.g., config loaded once). All async ops return Promises; callers handle loading/error.

## Known Risks
- Direct `fetch` calls lack retry/backoff → flaky external services.
- Some helpers (date sanitization) duplicated across lib files.
- Error handling limited to thrown errors; no centralized strategy.
- Tight coupling to Supabase schema; schema changes require lib updates.

## Future Improvements
- Introduce generic HTTP wrapper with retry, timeout, and logging.
- Consolidate date/phone utilities into shared module.
- Add TypeScript typings for all exported functions.
- Cache Freshdesk config with TTL to reduce network load.
- Export a single `api` object to group related services (billing, sync, AI).

## File Reference Map
- `src/lib/billing.js`
- `src/lib/clientSync.js`
- `src/lib/formatPhone.js`
- `src/lib/freshdeskConfig.js`
- `src/lib/freshdeskSync.js`
- `src/lib/gravidade.js`
- `src/lib/greeting-engine/compose.ts`
- `src/lib/greeting-engine/content/temporal.ts`
- `src/lib/greeting-engine/content/identity.ts`
- `src/lib/greeting-engine/content/operational.ts`
- `src/lib/greeting-engine/seed.ts`
- `src/lib/greeting-engine/types.ts`
- `src/lib/greeting-engine/debug.ts`
- `src/lib/greeting-engine/observability.ts`
- `src/lib/greeting-engine/hooks/useGreeting.ts`
- `src/lib/healthScore.js`
- `src/lib/icons.js`
- `src/lib/onboardingLabels.js`
- `src/lib/openrouterService.js`
- `src/lib/reportGenerator.js`
- `src/lib/supabaseClient.js`
- `src/lib/supportUtils.js`
