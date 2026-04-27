# Module — UI

## Purpose
Collection of reusable presentational components. Provide consistent visual language (colors, spacing, typography) across app. Encapsulate common UI patterns (avatars, badges, buttons, cards, modals, spinners, health indicators) to avoid duplication and simplify styling.

## Responsibilities
- Render atomic elements with Tailwind classes.
- Accept props for variant, size, custom class names.
- Expose simple API for callers (e.g., `<Button variant="primary" size="md">`).
- Handle minimal interaction logic (open/close modal, file upload preview, avatar upload).
- Keep components stateless aside from local UI state (loading flags, file preview).

## Module Structure
| Component | Role |
|-----------|------|
| `Avatar.jsx` | Shows circular user initials with deterministic background colour based on name. Supports size variants (`sm`‑`xl`). |
| `Badge.jsx` | Inline label with colour variants (green, amber, red, sky, slate, purple, navy, blue, lime). |
| `Button.jsx` | Clickable element with style variants (`primary`, `secondary`, `green`, `danger`, `ghost`) and size options (`xs`‑`lg`). |
| `Card.jsx` | Container with optional click behaviour, border hover effect. |
| `HealthBar.jsx` | Horizontal bar visualising a value/maximum ratio; auto‑chooses colour based on percentage. Also exports `HealthScore` component showing numeric score with colour‑coded label. |
| `Modal.jsx` | Centered overlay with title, close button, customizable width. Renders children only when `isOpen` true. |
| `PageHeader.jsx` | Header for pages, renders title, optional subtitle and action element. |
| `Spinner.jsx` / `PageSpinner.jsx` | Circular loading indicator; size variants `sm`/`md`/`lg`. `PageSpinner` centers spinner in a fixed‑height container. |
| `StagePill.jsx` | Small rounded label for workflow stages; colour customisable via prop. |
| `UserEditModal.jsx` | Full‑screen modal for editing user profile (name, emails, phone, avatar). Handles avatar upload to Supabase storage, profile update, password‑reset request. Uses internal `AvatarUpload` sub‑component. |
| `VersionBadge.jsx` | Fixed‑position element displaying commit hash (`__COMMIT_HASH__`). |

## Data Flow
Components receive data via props; UI interactions (click, file select) trigger callbacks passed from parent or perform internal async actions (e.g., `UserEditModal` communicates with Supabase, shows toast messages). No external state management; any needed data (e.g., current profile) is supplied by callers.

## Dependencies
- Tailwind CSS utility classes for styling.
- `react-hot-toast` for notifications (used in `UserEditModal`).
- `supabaseClient` for storage and auth operations (avatar upload, profile update, password reset).
- Utility functions from `../lib/formatPhone` for phone masking/stripping (used in `UserEditModal`).

## Integration Points
- Used throughout pages and feature components (`ProjectModal.jsx`, `AtendimentoPage.jsx`, `Dashboard.jsx`).
- `UserEditModal` invoked from user settings UI, relies on auth context for current user id.
- `VersionBadge` displayed globally (e.g., in root layout) to expose build version.

## Main Usage Patterns
```jsx
<Button variant="primary" size="md" onClick={handle}>Salvar</Button>
<Avatar name={profile.name} size="lg" />
<Modal isOpen={open} onClose={close} title="Editar" maxWidth="max-w-lg"><UserEditModal .../></Modal>
```
Components are composable; callers pass custom `className` for further styling.

## State Management
Stateless UI except where local UI state required (e.g., `Spinner` size, `UserEditModal` loading flags, avatar preview). State handled with React `useState` hooks.

## Known Risks
- `UserEditModal` performs direct Supabase calls; errors only surface via toast, no fallback UI.
- `Modal` renders children unconditionally when open; heavy children may impact performance.
- Color variants hard‑coded; adding new theme requires updating each component.

## Future Improvements
- Extract common style constants (color palette, spacing) to a theme module.
- Replace duplicated variant objects with a shared utility.
- Add TypeScript typings for component props.
- Implement accessibility attributes (ARIA labels, focus trap in `Modal`).
- Provide a unified `Icon` component to replace inline SVGs.

## File Reference Map
- `src/components/ui/Avatar.jsx`
- `src/components/ui/Badge.jsx`
- `src/components/ui/Button.jsx`
- `src/components/ui/Card.jsx`
- `src/components/ui/HealthBar.jsx`
- `src/components/ui/Modal.jsx`
- `src/components/ui/PageHeader.jsx`
- `src/components/ui/Spinner.jsx`
- `src/components/ui/StagePill.jsx`
- `src/components/ui/UserEditModal.jsx`
- `src/components/ui/VersionBadge.jsx`
