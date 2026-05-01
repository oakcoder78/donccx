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
| `SettingsSectionHeader.jsx` | Reusable header component for Settings pages. Standardises page headers with icon, title, subtitle, and actions. |

## Settings UI Standards
The following patterns are used across all Settings pages to ensure visual and structural consistency.

### SettingsSectionHeader
`SettingsSectionHeader` is a reusable component used across all Settings pages. Purpose: standardise page headers and eliminate duplicated layout logic.

Structure:
- icon (left aligned)
- title (required)
- subtitle (optional)
- actions (right aligned)

Visual rules:
- icon size: `w-4 h-4`
- subtitle size: `text-xs`
- actions aligned to the right
- consistent spacing between elements

All Settings pages must use this component. Manual headers are deprecated.

### Header Action Pattern
Primary actions must be placed inside the header `actions` property. Examples: Create, Invite, Add, Configure. Top-level actions should not be placed inside content cards. This improves consistency and visual predictability.

### Settings Table Pattern
Tables inside Settings modules follow a standard visual pattern. Rules:
- table header uses navy color (`bg-donc-navy`)
- actions use icons instead of text
- consistent spacing between rows
- consistent font size (`text-sm`)
- hover behavior consistent across tables

This improves readability and standardises interaction behavior.

### Icon-Based Actions
Actions inside tables should use icons instead of text labels. Examples: Edit → pencil icon, Delete → trash icon, Duplicate → copy icon. Icons reduce visual noise and improve alignment consistency.

### Settings Card Layout
All Settings content blocks use a shared visual pattern. Structure:
- container class: `bg-bg-primary`
- border: `border-border-tertiary`
- rounded corners: `rounded-lg`
- padding: `p-4`
- vertical spacing: `space-y-4`

This ensures consistent spacing and visual grouping.

### Subtitle Typography Standard
Subtitles in Settings headers use the following typography:
- font size: `text-xs`
- color: `text-text-tertiary`
- spacing: `mt-1`

This standard applies to all Settings section headers.

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
- `src/components/ui/SettingsSectionHeader.jsx`
- `src/components/ui/Spinner.jsx`
- `src/components/ui/StagePill.jsx`
- `src/components/ui/UserEditModal.jsx`
- `src/components/ui/VersionBadge.jsx`
