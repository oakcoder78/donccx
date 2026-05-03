# Documentation Index Bootstrap

## Purpose

Initialize minimal documentation index for efficient lookup.

This file defines the default documentation sources
that should be indexed early in the session.

---

## Primary Index Targets

These must be indexed first:

docs/modules/
docs/system/
docs/core-concepts.md
docs/platform-overview.md

These contain:

- architectural structure
- module behavior
- integration rules
- reusable logic patterns

---

## Deferred Index Targets

Index only when required:

docs/activity-attachments/
docs/email-templates/

Reason:

These contain:

- procedural flows
- static content
- specialized workflows

Avoid indexing prematurely.

---

## Index Behavior

Index once per session.

Avoid repeated indexing of same directories.

Always prefer:

search → retrieve → summarize

Never:

load full documentation into context.