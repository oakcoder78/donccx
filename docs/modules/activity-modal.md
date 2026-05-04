# Activity Modal UI Pattern

## Overview

The Activity Modal is a creation and editing interface for activities. It is designed with a **writing-first** approach, prioritizing the description field while keeping secondary content accessible but unobtrusive.

The modal serves two main purposes:
- Creating new activities
- Editing existing activities

## Layout Structure

The modal uses a **two-panel horizontal layout**:

| Panel | Purpose | Behavior |
|-------|---------|----------|
| Left | Main form — primary data | Always visible, full width when drawer closed |
| Right (Drawer) | Secondary content — notes and attachments | Collapsible, toggled via button |

### Drawer Behavior
- **Closed by default**: The modal starts with only the main form visible.
- **Toggle**: A "Registrar resultado" button (positioned after the description field) opens the drawer.
- **No layout shift**: Opening the drawer expands the modal width but does not push content vertically or move the footer.

## Field Hierarchy

Fields are organized by priority:

1. **Primary** — The main writing field
   - `Descrição` (required, 5 rows minimum)

2. **Secondary** — Result content (in drawer)
   - `Resultado / Notas`
   - `Anexos`

3. **Metadata** — Activity classification
   - `Tipo`, `Data`, `Hora`, `Status`

4. **Context** — Relationships
   - `Cliente`, `Contato`, `Vencimento`, `Responsável`

## UX Decisions

### Why a drawer instead of a fixed multi-column layout?
- Keeps the main form as the clear focal point
- Allows users to focus on writing without visual clutter
- Secondary content is accessible on-demand, not competing for attention

### Why is Description the dominant field?
- Activities are fundamentally about describing what was done or needs to be done
- The writing experience should feel spacious and uninterrupted
- Other fields are supporting context, not the core content

### Why reduce visual density of metadata fields?
- Tipo, Data, Hora, Status are filled quickly and don't need prominent space
- Compact presentation keeps them accessible without distracting from writing
- Consistent use of grids and gaps maintains readability

### Why group notes and attachments together?
- Both are secondary content added after the primary activity is described
- Keeping them in one place (the drawer) creates a clear mental model
- Users know where to look for results and evidence

## Interaction Patterns

1. **Drawer toggle**
   - Button labeled "Registrar resultado" appears after the Description field
   - Clicking opens the right panel with notes and attachments
   - Button changes to "Ocultar painel" when open

2. **Indicator badge** (future implementation)
   - A small checkmark badge appears on the toggle button when notes or attachments exist
   - Helps users remember they have secondary content without opening the drawer

3. **Footer stability**
   - Action buttons (Cancelar, Criar/Salvar) always stay at the bottom of the modal
   - Opening the drawer does not move the footer upward or cause layout shifts

## Layout Rules

These rules must be preserved when modifying the modal:

- **Left panel is primary** — The main form must remain the dominant area; never make it equal in prominence to the drawer.
- **No fixed multi-column for the entire form** — Use flexible grids that adapt to content, not rigid full-width columns.
- **Footer stays at bottom** — The action buttons must not move when the drawer opens or closes.
- **Avoid duplicated labels** — Each field has one label; do not add wrapper labels around the drawer content.
- **Consistent spacing** — Maintain uniform gaps and padding throughout; avoid mixing different spacing scales.
- **Description remains dominant** — Keep it as the largest text area; do not shrink it to match other fields.

## Do / Don't

### DO
- Keep the Description field prominent (6+ rows)
- Use the drawer for secondary content (notes, attachments)
- Maintain visual hierarchy: primary → secondary → metadata → context
- Use consistent grid patterns for grouped fields
- Keep the footer fixed at the bottom of the modal

### DON'T
- Compress the main form excessively when the drawer is open
- Introduce another primary content area that competes with Description
- Move metadata fields below Description in the field order
- Break vertical alignment between left and right panels
- Add unnecessary wrappers or nested containers
- Use fixed pixel widths for layout elements

## Related Components

- `ActivityModal.jsx` — The modal component implementing this pattern
- `AttachmentInput` — Used in the drawer for file uploads
- `Modal` — Base modal container
- `Button` — Action buttons in footer