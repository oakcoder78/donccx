# Shared Modules

Describes reusable technical modules that support the main system modules, facilitating code reuse and decoupling between functionalities.

## UI

- **Technical role:** Reusable visual interface components abstracting common UI elements.
- **Functionality:** Buttons, inputs, icons, cards, modals, loaders, etc.
- **Dependencies:** Used by almost all pages and layout modules to compose the user experience.
- **Contribution:** Centralizes style and visual logic, reducing duplication and enabling global UI changes from a single point.

## Layout

- **Technical role:** Layout structures that organize UI placement on pages and routes.
- **Functionality:** Grid, containers, headers, sidebars, responsive content areas.
- **Dependencies:** Consumed by `pages/*` and UI modules for consistent positioning.
- **Contribution:** Guarantees visual consistency across the application and eases section reordering without touching business logic.

## Hooks

- **Technical role:** Custom React functions encapsulating reusable state and effect logic.
- **Functionality:** Hooks such as `useClients`, `useActivities`, `useProjects`, `useHealthScore`, `useSegments`, `useStages`, among others, encapsulating data access and reusable logic.
- **Dependencies:** Used by UI components, contexts and services needing reactive logic.
- **Contribution:** Avoids repeated effect/state code and promotes isolated unit testing.

## Contexts

- **Technical role:** Global state providers sharing data among components without prop drilling.
- **Functionality:** Manages user authentication and session via `AuthContext`.
- **Dependencies:** Any component requiring global information (UI, hooks, services).
- **Contribution:** Centralizes shared state management, improving scalability and maintainability.

## Lib

- **Technical role:** Low‑level utility libraries that do not depend on React.
- **Functionality:** Formatting helpers, date manipulation, validation, API wrappers, etc.
- **Dependencies:** Used by hooks, services and occasionally by components needing pure logic.
- **Contribution:** Isolates generic functionality, facilitating reuse across contexts (frontend, scripts, tests).

## Services

- **Technical role:** Abstraction layer for external calls and business logic.
- **Functionality:** Integrations with Supabase, activity‑attachment management and communication with externally configured services.
- **Dependencies:** Consumed by hooks, UI components (via callbacks) and backend scripts.
- **Contribution:** Keeps external communication separate from UI, allowing easy mocking/replacement of services.

## Donkie

- **Technical role:** Internal assistant interface integrated into the user experience.
- **Functionality:** Components like `DonkieButton` and `DonkiePanel` enabling opening and interacting with the assistant within the UI.
- **Dependencies:** Used by pages and components that integrate assisted or automated features.
- **Contribution:** Adds an interactive layer for operational support and internal automation.
