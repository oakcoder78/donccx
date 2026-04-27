# Module — Onboarding Styles

## Purpose
Defines the CSS‑in‑JS style objects used by the onboarding UI components (timeline, activity list, pending items, response picker). These objects are consumed via `style={styles.xxx}` throughout the onboarding flow.

## Responsibilities
- Centralise visual specifications for timeline milestones, activity search, pending tasks, and response‑picker UI.
- Provide colour, spacing, typography and layout constants in a single export.
- Ensure consistency across onboarding components without relying on external CSS files.

## Module Structure
```js
export const styles = {
  timeline: { /* timeline related styles */ },
  activity: { /* activity list styles */ },
  pending:  { /* pending tasks styles */ },
  respPicker: { /* response picker styles */ },
}
```
Each top‑level key contains nested objects that map directly to JSX elements via inline `style` props.

## Core Style Definitions
### Timeline
- **wrap** – horizontal scroll container.
- **row** – flex row for milestones.
- **milestone** – column flex box, fixed width 130 px.
- **milestoneCircle** – base circle (white background, border, centred icon).
- **milestoneCircleDone / Future / Active** – colour variants for status.
- **milestoneLabel / Date / Status** – typography for label, date and status badge.
- **connector / connectorDone / connectorActive** – horizontal line between milestones with status colours.
- **milestonePanel** – panel displayed under a milestone.

### Activity
- **searchWrap / search / searchIcon** – layout for the activity search input.
- **catalogDropdown / catalogItem** – dropdown list for catalog suggestions.
- **item / row / caret / body** – container and row styles for each activity entry.

### Pending
- **item** – base card with left border indicating risk level.
- **blocker / high** – colour overrides for blocker and high‑risk items.
- **title** – heading style.
- **empty** – placeholder when no pending items.
- **form / formGrid / formActions** – layout for a quick‑action form.

### Response Picker
- **wrap** – container with scroll, border and background.
- **section** – section header style.
- **option / optionSelected** – individual selectable options.
- **miniAvatar / miniAvatarTeam** – small avatar circles used inside options.

## Dependencies
- No runtime dependencies; pure JavaScript object.
- Consumed by React components under `src/components/onboarding/` via `import { styles } from './OnboardingStyles'`.

## Integration Points
- Imported wherever onboarding UI is rendered, e.g. `OnboardingTimeline.jsx`, `OnboardingActivity.jsx`, etc.
- Styles are applied inline (`style={styles.xxx}`) so they are evaluated at runtime.

## Main User Flows
1. **Timeline rendering** – Milestones use `styles.timeline.milestone*` and connector colours to reflect health status.
2. **Activity search** – Input uses `styles.activity.search*`; dropdown uses `styles.activity.catalogDropdown`.
3. **Pending list** – Cards use `styles.pending.item` and risk modifiers.
4. **Response picker** – Options rendered with `styles.respPicker.option*` and avatar styles.

## Edge Cases
- All values are static; dynamic theming must be handled upstream.
- Missing keys in the `styles` object will result in React inline‑style warnings.

## Known Risks
- Fixed dimensions (e.g., 130 px width for milestones) may cause overflow on very small screens.
- Colour values are hard‑coded; palette changes require editing this file.

## Future Improvements
- Migrate to a design‑system token file (e.g., Tailwind config) for colour/spacing consistency.
- Add TypeScript typings for the `styles` object.
- Introduce responsive variants (media queries) if onboarding UI expands to mobile layouts.

---
*Generated directly from `src/components/onboarding/OnboardingStyles.js`; no behavior was inferred beyond the declared style objects.*
