# Core Modules

## Clients

*Purpose*: Manage all client‑related data within the platform.
*Responsibility*: Provides CRUD operations for client records, displays client overviews, and aggregates related information such as contacts, activities, health scores and onboarding status.
*Data*: Core client entity (name, company, identifiers) plus linked collections (contacts, activities, health metrics).
*Contribution*: Serves as the primary source of truth for every other module – activities, projects and dashboards reference client IDs to associate their records.

## Projects

*Purpose*: Organise work items and deliverables associated with a client.
*Responsibility*: Lists, creates and edits projects; links projects to clients and to activities.
*Data*: Project entity (title, description, status, timelines) and its relationship to a client.
*Contribution*: Enables CS teams to track deliverables, see progress, and tie activity logs to specific initiatives.

## Activities

*Purpose*: Record interactions, tasks and events that occur for a client or project.
*Responsibility*: Handles creation, display and mutation of activity records, including attachments and supervised actions via Donkie.
*Data*: Activity entity (type, title, description, date, status) and optional file attachments.
*Contribution*: Forms the chronological audit trail used by dashboards, health scoring and reporting.

## Contacts

*Purpose*: Store contact persons linked to each client.
*Responsibility*: Provides UI for viewing, adding and editing contact information (name, email, phone, role).
*Data*: Contact entity (personal details, communication channels) associated with a client.
*Contribution*: Supplies the communication endpoints required for outreach, activity logging and reporting.

## Dashboard

*Purpose*: Present a high‑level operational view for CS teams.
*Responsibility*: Aggregates data from clients, projects, activities, health scores and reports to render key metrics, charts and quick‑access cards.
*Data*: Summarised metrics, counts, health‑score distributions and recent activity feeds.
*Contribution*: Gives users rapid insight into overall performance, risk areas and workload distribution.

## Settings

*Purpose*: Centralise configuration and feature‑flag management.
*Responsibility*: Exposes UI sections for adjusting Supabase API keys, Freshdesk integration, user management, feature flags, and other platform‑wide options.
*Data*: Configuration objects, feature‑flag definitions and user role permissions.
*Contribution*: Allows administrators to tailor the platform, manage access and integrate external services used throughout the system.

## Health Score

*Purpose*: Evaluate and visualise the health of each client.
*Responsibility*: Calculates health metrics using activity data, contact engagement and custom rules; displays the score via UI components such as `HealthBar`.
*Data*: Numeric health score, underlying indicators (activity frequency, satisfaction signals, onboarding completion).
*Contribution*: Drives risk assessment, informs dashboard alerts and guides CS agents in prioritising outreach.
