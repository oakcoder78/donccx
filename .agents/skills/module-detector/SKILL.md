---
name: module-detector
description: Detect active module from file path and guide documentation and lookup workflows
---

# Module Detector

## Purpose

Identify the active module based on file path.

Guide:

- documentation lookup
- documentation updates
- workflow targeting

---

## Detection Rules

The repo has no `src/modules/` — detect by path prefix, then by business
domain keyword in the path (`clients`, `contract`, `billing`, `health`,
`activities`, `projects`, `dashboard`, `brief`, `email`, `donkie`, `settings`,
`cs-radar`, `greeting`, `contacts`, `onboarding`).

If working inside:

src/components/clients/ | src/pages/ClientFormPage.jsx | src/hooks/useClient*.js

Then:

Active module: clients

Documentation target:

docs/modules/clients.md

---

If working inside:

src/components/dashboard/ | src/pages/MeuDiaV3Page.jsx | src/pages/DashboardRoute.jsx

Then:

Active module: meu-dia (dashboard)

Documentation target:

docs/modules/meu-dia.md

---

If working inside:

src/pages/HealthDashboardPage.jsx | src/components/clients/ClientHealthDrawer.jsx | src/lib/healthScore.js | src/lib/scoring.js

Then:

Active module: health-score

Documentation target:

docs/modules/health-score-dashboard.md (engine + dashboard fundidos)

---

If working inside:

src/components/activities/ | src/services/activityAttachments/ | src/pages/AtendimentoPage.jsx

Then:

Active module: activities (attachments included)

Documentation target:

docs/modules/activities.md

---

If working inside:

src/components/projects/ | src/hooks/useProject*.js | src/pages/ProjectCockpitPage.jsx

Then:

Active module: projects

Documentation target:

docs/modules/projects.md

---

If working inside:

src/components/brief/ | src/pages/BriefPublicPage.jsx

Then:

Active module: brief

Documentation target:

docs/modules/brief.md

---

If working inside:

src/components/email/ | src/components/settings/SettingsEmail*.jsx

Then:

Active module: email/settings (by file)

Documentation target:

docs/modules/email.md or docs/modules/settings.md

---

If working inside:

src/components/donkie/ | src/hooks/useDonkie*

Then:

Active module: donkie

Documentation target:

docs/modules/donkie.md

---

If working inside:

src/components/settings/ | src/pages/*Settings* | src/pages/*Page.jsx (admin)

Then:

Active module: settings

Documentation target:

docs/modules/settings.md

---

If working inside:

src/hooks/ | src/services/ | src/lib/ | src/contexts/

Then:

Active module: determined by import usage — which domain imports this file
most. Documentation target: the domain's `docs/modules/<domain>.md`,
`##Data Interaction` (hooks/services) or `docs/architecture/` (shared infra).

---

If working inside:

src/components/ui/ | src/components/layout/ | src/index.css | tailwind.config.js

Then:

Active module: frontend-shared

Documentation target:

docs/architecture/frontend.md (`ui-patterns` section)

---

If working inside:

supabase/migrations/ | supabase/functions/

Then:

Active module: backend (by table/function domain)

Documentation target:

docs/architecture/backend.md + line in `docs/modules/<domain>.md##Data Interaction`

---

If module cannot be determined:

Fallback:

docs/product/vision.md
docs/product/glossary.md

---

## Output

Return:

- active module name
- documentation file target
- related documentation path