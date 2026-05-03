---
name: module-generator
description: Generate standardized module structure using project templates
---

# Module Generator

## Purpose

Create new modules using the official
module structure template.

Ensure:

- consistent structure
- standardized documentation
- predictable architecture

Avoid:

- manual module setup
- inconsistent file creation
- missing documentation

---

## When to Use

Use when:

- creating new modules
- introducing new domain features
- expanding system capabilities

Do NOT use when:

- modifying existing modules
- refactoring internal logic

---

## Module Creation Workflow

Step 1 — Receive Module Name

Input:

module_name

Rules:

- lowercase
- hyphen or camelCase allowed
- descriptive

Examples:

projects  
clients  
billing  
analytics  

---

Step 2 — Create Module Directory

Target:

src/modules/<module_name>/

---

Step 3 — Initialize Standard Structure

Create:

src/modules/<module_name>/

Required structure:

<module_name>Page.jsx  
<module_name>Modal.jsx  
<module_name>DetailPage.jsx  
index.js  

Optional directories:

components/  
hooks/  
services/  

Structure should match
existing module patterns.

---

Step 4 — Generate Documentation

Create:

docs/modules/<module_name>.md

Use template:

.agents/templates/module-doc-template.md

Replace:

<Module Name>

With:

module_name

---

Step 5 — Register Module in Index

Update:

.agents/docs-index.md

Add:

module_name

Under:

Module Documentation

Maintain alphabetical order.

---

## Output Requirements

Return:

- module created: yes/no
- documentation created: yes/no
- index updated: yes/no
- affected paths