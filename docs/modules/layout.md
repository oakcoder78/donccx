# Module — Layout

## Purpose
Provides the base visual structure and global navigation for the application. `Navbar` sits at the top of every page, offering brand logo, primary navigation links, and user account controls. It establishes a consistent header across all routes and acts as entry point for authentication actions and profile editing.

## Responsibilities
- Render brand logo and site title.
- Determine navigation set based on user role (`analyst` vs others) and permission (`canViewSettings`).
- Highlight active route via `NavLink` styling.
- Show user avatar/initials, name, role.
- Offer dropdown with "Minha conta" (opens `UserEditModal`) and "Sair" (sign‑out, redirect to `/login`).
- Expose commit hash in dropdown for version reference.
- Clean up dropdown overlay on outside click.

### Profile Editing Location
All personal profile editing is now centralized in the Navbar profile modal (`UserEditModal`). This includes:
- Avatar display and upload
- User identity information (name, email)
- Gender field

The previous separate profile editing page in Settings (`SettingsMinhaConta`) has been removed to eliminate duplicated interfaces and improve usability.

## Module Structure
- `Navbar.jsx` — main header component.
  - Imports `useAuth` for user/session data, `usePermissions` for role‑based link visibility.
  - Builds `links` array: analyst view (single Atendimento link) or full set plus optional Configurações link.
  - Handles sign‑out via `signOut` then navigation.
  - Manages local UI state (`dropdownOpen`, `showProfile`).
  - Renders `UserEditModal` when profile requested.

## Data Flow
1. On render, `useAuth` provides `user`, `profile`, `signOut`, `refreshProfile`.
2. `usePermissions` supplies `canViewSettings` boolean.
3. Based on `profile.role`, selects navigation array.
4. `NavLink` from `react-router-dom` automatically marks active route, applying active CSS.
5. Clicking user button toggles dropdown; selecting "Minha conta" sets `showProfile` → renders `UserEditModal` with current profile and email.
6. "Sair" triggers async `signOut`, then `navigate('/login')`.

## Dependencies
- React (`useState`).
- `react-router-dom` (`NavLink`, `useNavigate`).
- `AuthContext` (`useAuth`).
- `usePermissions` hook.
- UI components: `UserEditModal`.
- Tailwind CSS utilities for layout and colors.

## Integration Points
- Wrapped in root layout (e.g., `src/App.jsx`) so it appears on every protected route.
- Relies on authentication context for user data.
- Permission hook reads from backend to conditionally expose settings link.
- `UserEditModal` uses `supabaseClient` for avatar upload and profile updates.

## Main Usage Patterns
```jsx
import { Navbar } from './components/layout/Navbar';
function App() { return (<><Navbar /><Outlet /></>); }
```
`Navbar` is placed at top level; other page components render beneath it.

## State Management
Local component state:
- `dropdownOpen` (boolean) controls visibility of account menu overlay.
- `showProfile` (boolean) toggles `UserEditModal`.
- `initials` derived from profile data for avatar fallback.
All other data comes from context/hooks.

### Gender Field Placement
The gender field is now edited inside the Navbar profile modal. It is no longer managed in separate Settings pages. This change consolidates all personal profile editing into a single, consistent location.

### Removal of Duplicate Profile Interfaces
Previously, profile data could be edited in multiple locations. Now, all personal profile editing is centralized in the Navbar modal. Benefits include:
- Clearer user workflow (profile access from any page)
- Reduced maintenance complexity
- Improved UI consistency

## Known Risks
- Dropdown overlay relies on a full‑screen invisible div to capture outside clicks; may interfere with other fixed UI elements.
- Role logic hard‑coded; adding new roles requires updating both `Navbar` and permission hook.
- No lazy loading; `UserEditModal` component imported eagerly, increasing bundle size.

## Future Improvements
- Extract navigation link definition to a config file for easier extensibility.
- Implement accessibility features (ARIA, keyboard navigation) for dropdown.
- Lazy‑load `UserEditModal` with `React.lazy`/`Suspense`.
- Centralize theme colors instead of hard‑coded Tailwind classes.
- Add unit tests for role‑based link rendering.

## File Reference Map
- `src/components/layout/Navbar.jsx`
