# Mobile UI kit — Donc (field tech app)

The app the field team carries. Opens to today's route; each stop opens a checklist with photo upload, signature, and a "finalizar OS" flow.

**Screens**

1. **Today** — greeting, route summary, ordered list of stops.
2. **Stop detail** — customer card, checklist, photo grid, action buttons.
3. **Signature confirm** — success state.

Rendered inside an iOS frame from the starter component.

**Components**

- `AppShell.jsx` — phone chrome + tab bar
- `TodayScreen.jsx` — greeting, summary, stop list
- `StopScreen.jsx` — stop detail + checklist
- `ConfirmScreen.jsx` — success state
- `Primitives.jsx` — shared small components
