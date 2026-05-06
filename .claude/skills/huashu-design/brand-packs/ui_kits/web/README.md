# Web UI kit — Donc

A clickable, high-fidelity reference for the web-side of Donc: a marketing hero surface and the ops dashboard. Components are cosmetic-only React — no real routing, auth, or data.

**Screens included**

1. **Marketing / landing** (hero, feature strip, CTA) — reachable at the top.
2. **Ops dashboard** — sidebar + topbar + today's OSs + KPI row + route map preview.
3. **Route planner** — list of routes with draggable-looking legs (non-functional).

Nav between them with the top-right switcher.

**Components** (`*.jsx`)

- `Shell.jsx` — app chrome (Sidebar, Topbar)
- `Marketing.jsx` — hero + feature strip
- `Dashboard.jsx` — KPI cards, OS list, map stub
- `RoutePlanner.jsx` — route list + leg rows
- `Primitives.jsx` — Button, Badge, Card, Input, IconButton, Avatar, Stat

Open `index.html` to see it running.
