# Software Design Document — UI Pattern Library Phase 2

## Status

| Field | Value |
|-------|-------|
| Status | Ready |
| Priority | M |
| Owner | — |
| SDD created | 2026-06-14 |
| Estimated effort | 2-3h |

## Goal

Document the remaining 8 UI pattern categories that exist in the codebase but are not yet in `docs/ui-patterns.md`. Coverage target: ~95% — any new page built from scratch will have a documented tailwind pattern for every element.

## Scope

Add sections 25-32 to `docs/ui-patterns.md`. Each section follows the same structure as sections 1-24: purpose, exact Tailwind classes, variations, component reference, usage examples.

### Patterns

| # | Pattern | Variations | Source files | Effort |
|---|---------|-----------|-------------|--------|
| 25 | **Collapsible / Accordion** | Dimension card collapsible (ClientTabHealth), Client row accordion (ProjectCockpit), Global activities accordion (ProjectCockpit) | `ClientTabHealth.jsx`, `ProjectCockpitPage.jsx` | low |
| 26 | **Phase / Step Indicator** | StepIndicator (AtendimentoPage), PhaseCircle 48px (OnboardingDetailPage), PhaseCircleSmall 32px (ProjectCockpitPage) | `AtendimentoPage.jsx`, `OnboardingDetailPage.jsx`, `ProjectCockpitPage.jsx`, `OnboardingStyles.js` | low |
| 27 | **Summary / KPI Bar** | Horizontal stats bar with vertical dividers, icon + count + status color | `ProjectCockpitPage.jsx` | low |
| 28 | **File Upload** | ImageUploader (ReportEditor), OCR upload (AtendimentoPage), AttachmentInput (activityAttachments), logo upload (ClientForm), avatar upload (UserEditModal), email attachment (EmailComposerModal) | `ReportEditorPage.jsx`, `AtendimentoPage.jsx`, `AttachmentInput.jsx`, `ClientForm.jsx`, `UserEditModal.jsx`, `EmailComposerModal.jsx` | medium |
| 29 | **Data Visualization** | Chart.js Line (ClientTabHealth, uso, suporte), Chart.js Bar (ClientTabOverview), heatmap calendar (CsRadarPage), SVG bars (reportGenerator) | `ClientTabHealth.jsx`, `ClientSubUso.jsx`, `ClientSubSuporte.jsx`, `ClientTabOverview.jsx`, `CsRadarPage.jsx`, `reportGenerator.js` | medium |
| 30 | **Activity / Timeline Item** | Expandable row (OnboardingDetailPage), Activity card (ClientTabActivities), Milestone list item (ProjectCockpitPage), Pending item (OnboardingDetailPage) | `OnboardingStyles.js`, `ClientTabActivities.jsx`, `ProjectCockpitPage.jsx` | medium |
| 31 | **Section Header** | SettingsSectionHeader component, Inline card title bar, Section label | `SettingsSectionHeader.jsx`, multiple pages | low |
| 32 | **Responsive Layout** | Breakpoint reference (sm/md/lg/xl/2xl), Grid patterns (cols-1 md:cols-2, etc), Page width conventions (max-w-5xl vs max-w-7xl), Hide/show breakpoints | All pages | low |

### Out of scope

- Component API docs (belongs in `docs/modules/components.md`, not `docs/ui-patterns.md`)
- Patterns that don't exist yet (pagination, sortable tables, drag-and-drop lists beyond what's in code)
- CSS custom properties / design tokens beyond current Tailwind classes

## Definition of Done

1. `docs/ui-patterns.md` has 8 new sections (25-32) with exact Tailwind classes
2. `docs/CHANGELOG.md` updated
3. `npm run build` passes
4. No dead/orphaned references created

## Files

- `docs/ui-patterns.md` — Add sections 25-32
- `docs/CHANGELOG.md` — Add entry

## Risks

- Time estimate assumes pattern extraction only, not refactoring existing code to use the patterns
- `OnboardingStyles.js` has some patterns that may overlap with settings styles — verify uniqueness before documenting
- Chart.js config patterns may change with library version updates
