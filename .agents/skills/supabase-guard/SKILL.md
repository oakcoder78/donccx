---
name: supabase-guard
description: Validate database changes and enforce migration-first workflow for Supabase
---

# Supabase Guard

## Purpose

Ensure safe database changes by enforcing
migration-first workflow.

Prevent schema drift and undocumented changes.

This skill validates intended changes before execution.

---

## When to Use

Use when:

- creating tables
- modifying schema
- updating columns
- altering indexes
- modifying constraints
- adding foreign keys
- creating storage buckets
- updating database logic

---

## Validation Workflow

Before executing database-related changes:

Step 1 — Detect Intended Change

Identify:

- affected tables
- affected columns
- type of modification

Examples:

- create table
- add column
- update index
- delete column

---

Step 2 — Check Migration Requirement

If schema will change:

Migration is required.

Never:

Apply schema changes without migration.

Always:

Create migration first.

Command:

supabase migration new <descriptive_name>

---

Step 3 — Validate Naming

Migration names must be:

- descriptive
- concise
- lowercase
- underscore separated

Examples:

create_projects_table  
add_status_to_clients  
update_activity_indexes  

Avoid:

test1  
fix  
temp  

---

Step 4 — Documentation Awareness

If schema changes:

Check:

docs/modules/  
docs/system/

Update documentation if structure changes.

---

## Safety Rules

Never:

- execute direct schema changes
- modify tables without migration
- delete columns silently
- rename tables without explicit migration

Always:

- create migration first
- review schema dependencies
- validate existing relationships

---

## Output Requirements

Return:

- migration required: yes/no
- suggested migration name
- affected tables
- potential risks

### Supabase Auth Protection

Never manipulate Supabase Auth schema directly via SQL.

Forbidden:
- INSERT INTO auth.users
- UPDATE auth.users
- DELETE FROM auth.users

Reason:
Supabase Auth is managed by GoTrue and requires internal logic for:
- password hashing
- JWT generation
- session management

Direct SQL manipulation may:
- break authentication
- invalidate sessions
- cause inconsistent user state

Always use:
- Supabase Studio (Authentication UI)
- Supabase CLI (when available)
- Supabase Auth APIs

If user creation or modification is required:
- provide instructions instead of SQL
- never simulate auth behavior manually