# doncCX Hub — Documentation Index

## Purpose

Provide lightweight reference mapping
for documentation lookup.

Avoid loading full documentation files.

Guide agents toward minimal,
relevant documentation retrieval.

---

# Core Documents

## core-concepts.md

Location:

docs/core-concepts.md

Contains:

- system core concepts
- domain-level definitions
- shared architectural language

Use when:

- system terminology unclear
- feature logic references core abstractions
- module responsibilities overlap

---

## platform-overview.md

Location:

docs/platform-overview.md

Contains:

- platform-wide architecture
- high-level structure
- cross-module relationships

Use when:

- architectural context required
- understanding module relationships
- planning new features

---

# Module Documentation

Location:

docs/modules/

Pattern:

docs/modules/<module-name>.md

Contains:

- module responsibilities
- key components
- data interaction patterns
- UI behavior
- dependencies

Available Modules:

- activities
- activity-attachments
- brief
- clients
- contexts
- donkie
- greeting-engine
- health-score
- hooks
- layout
- lib
- pages
- projects
- services
- settings
- ui

Use when:

- modifying existing module
- updating UI behavior
- adjusting workflows
- integrating services

---

# System Documentation

Location:

docs/system/

Contains:

- architecture layers
- data flow
- integration points
- shared modules

Available Topics:

- core-modules
- data-flow
- deployment-context
- future-architecture
- high-level-architecture
- integration-points
- shared-modules
- system-overview
- system-purpose

Use when:

- updating architecture
- modifying integrations
- analyzing system behavior

---

# Activity Attachments Domain

Location:

docs/activity-attachments/

Contains:

- step-based workflows
- attachment processing logic
- storage handling flows

Use when:

- working with file uploads
- modifying activity workflows
- handling media or attachments

Deferred Loading:

Index only when relevant.

---

# Email Templates Domain

Location:

docs/email-templates/

Contains:

- email content templates
- authentication flows
- user messaging

Use when:

- modifying authentication emails
- updating notification templates

Deferred Loading:

Index only when relevant.

---

# Lookup Strategy

Always:

1 — Detect module  
2 — Consult documentation index  
3 — Retrieve minimal relevant file  
4 — Summarize only required sections  

Never:

- load full directories
- retrieve unrelated files
- duplicate documentation content

---

# Index Version

Version:

1.0

Generated:

Initial baseline index.