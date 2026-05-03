# doncCX Hub — Core Agent Rules

See: ./.agents/docs-index-bootstrap.md

---

## Skill Usage Policy

Before writing new logic:

1. Check available skills in:

.agents/skills/

2. Prefer existing skills instead of writing new code

3. If new reusable logic is created:

Convert it into a new skill

Never:

- Duplicate existing skill logic
- Write large scripts inline when a skill fits
- Reimplement behavior already covered by an existing skill

---

## Shared Skills Registry

All agents must use shared skills located at:

./.agents/skills/

Available core skills:

- docs-lookup
- change-classifier
- module-detector
- docs-writer
- supabase-guard
- caveman
- caveman-review
- caveman-commit
- caveman-help
- caveman-compress
- compress
- find-skills

Rules:

- Use shared skills as primary behavior source
- Avoid creating duplicate skill directories
- Maintain single source of truth for all reusable logic

Claude Code must reference skills from this shared location
instead of using duplicated skill directories.

---

## Mandatory Module Detection, Documentation and Database Workflow

Before implementing any code related to:

- existing modules
- UI components
- workflows
- services
- hooks
- database logic

Agents MUST:

---

Step 1 — Detect Active Module

Invoke skill:

module-detector

Identify:

- active module name
- related documentation path

---

Step 2 — Retrieve Documentation

Invoke skill:

docs-lookup

Use:

- detected module
- recommended documentation path

Identify:

- existing implementation patterns
- expected behavior
- architectural constraints

---

Step 3 — Validate Database Impact

If change involves:

- schema
- tables
- columns
- indexes
- constraints
- storage buckets

Invoke skill:

supabase-guard

Validate:

- if migration is required
- migration naming
- schema dependencies

---

Step 3.5 — Classify Change Impact

Invoke skill:

change-classifier

Determine:

- minor
- moderate
- major

Rules:

If change is minor:

- skip documentation update

If change is moderate or major:

- documentation update required
- database validation may be required

---

Step 4 — Proceed With Implementation

Only after:

- module identified
- documentation reviewed
- database impact validated (if applicable)
- change classified

Implementation may begin.

---

## Skip Conditions

docs-lookup may be skipped only when:

- creating entirely new module
- working outside documented domains
- explicitly instructed by user
- performing trivial formatting changes

Otherwise:

Lookup is mandatory.

Skipping lookup without valid reason
is considered incorrect workflow behavior.

---

## Behavior Consistency Rules

Always:

- verify patterns before implementing
- reuse known structures
- maintain alignment with existing modules
- prefer consistency over invention

Never:

- introduce new patterns without justification
- change behavior without checking documentation
- create undocumented logic
- bypass lookup when modifying known components

---

## Long-Term Governance

As the project grows:

- Skills must remain reusable
- Documentation must remain searchable
- Workflows must remain deterministic
- Architectural decisions must be preserved

Goal:

Maintain a predictable, low-noise,
high-consistency development environment.

---

## Mandatory Documentation Update Workflow

After completing implementation classified as moderate or major:

If change involved:

- new module
- workflow update
- service creation
- database schema change
- integration update
- behavior modification

Invoke skill:

docs-writer

Generate:

- structured documentation update
- relevant module documentation
- architecture updates (if needed)

Documentation must be updated
before considering implementation complete.