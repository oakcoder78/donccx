# Module — Contexts

## Purpose
Context layer supplies global authentication state to React tree. Wraps Supabase auth, tracks current user, profile, loading flag, and role‑based helpers. Provides unified API for login, logout, Google OAuth, and profile refresh.

## Responsibilities
- Initialise Supabase session on app start.
- Subscribe to auth state changes (login, logout, token refresh).
- Fetch user profile from `profiles` table when user available.
- Expose `user`, `profile`, `loading` and role booleans (`isAdmin`, `isManager`, `isAnalyst`).
- Provide auth actions: `signIn`, `signInWithGoogle`, `signOut`, `refreshProfile`.
- Clean up subscription on unmount.

## Module Structure
- `AuthContext.jsx` — creates `AuthContext`, implements `AuthProvider` component, and exports `useAuth` hook.

## Data Flow
1. On mount, call `supabase.auth.getSession()` → set `user` & `loading`.
2. If user exists, call `fetchProfile(user.id)` → set `profile`.
3. Register `supabase.auth.onAuthStateChange` listener:
   - On event, update `user`.
   - If new user, fetch profile; else clear `profile`.
4. Auth actions invoke Supabase methods (`signInWithPassword`, `signInWithOAuth`, `signOut`).
5. `refreshProfile` re‑fetches profile for current user.

### Logout resilience (2026-08-29, `3d1ed81`)
`signOut` uses `supabase.auth.signOut({ scope: 'local' })` — it clears the local session and emits
`SIGNED_OUT` **without** the `POST /auth/v1/logout` server call, which 403s (and stalls) when the
access token is already expired. The `role_impersonations` cleanup that precedes it is wrapped in
`try/catch` so a dead session can never block logout. Callers should also hard-redirect
(`window.location.assign('/login')`) rather than rely on `await signOut()` resolving — see
`Navbar.handleSignOut`.

## Dependencies
- `../lib/supabaseClient` – Supabase JS client.
- React core (`createContext`, `useContext`, `useEffect`, `useState`).

## Integration Points
- Wrapped around entire app in `src/main.jsx`/`src/App.jsx` to provide auth data to all pages.
- Consumed by UI components and hooks (`useAuth`) for protected routes, role checks, and API calls requiring user ID.

## Main Usage Patterns
```js
const { user, profile, loading, isAdmin, signIn, signOut } = useAuth();
if (loading) return <Spinner/>;
if (!user) return <LoginPage/>;
// protected UI renders with role checks
```

## State Management
- Local React state (`user`, `profile`, `loading`).
- Role booleans derived from `profile?.role`.
- Listener updates state reactively; cleanup unsubscribes.

## Known Risks
- Profile fetch runs on every auth change; race conditions if rapid events occur.
- No error handling for `fetchProfile` failures beyond resetting profile to null.
- `signInWithGoogle` redirects to `/dashboard`; assumes route exists.
- A silently-dead session (refresh failed, no `SIGNED_OUT`) is not auto-recovered — the user sees 401s
  until they log out/in. `signOut` is now hardened (above) but auto re-login on refresh failure is a
  pending follow-up.
- The Supabase client runs with the Web Locks cross-tab lock **disabled** (`src/lib/supabaseClient.js`,
  `89c022e`) — it deadlocked for minutes on every deploy. See `docs/modules/lib.md`.

## Future Improvements
- Add error state for profile fetch failures.
- Cache profile in localStorage to survive page reloads.
- Expose token refresh utility.
- TypeScript typings for context value.

## File Reference Map
- `src/contexts/AuthContext.jsx`
