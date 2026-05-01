# Data Flow

This document describes how data flows within the application, from user interaction to persistence and visual return on the interface.

The data flow follows a modular architecture based on:

- Pages (screen orchestration)
- Components (user interface)
- Hooks (data logic)
- Services (external operations and persistence)
- Lib (rules and utilities)
- Contexts (global state)

The separation between these layers ensures predictability, reusability, and decoupling across the system.

---

## User Interaction Flow

This flow describes the typical behavior when a user performs an action in the interface.

1. **User Interaction**  
   The user performs an action in the UI, such as:

   - Create a client
   - Register an activity
   - Update a project
   - Edit a contact

2. **Component Calls Hook**  
   The React component responsible for the UI calls a specific hook.

   Real examples:

   - `useClients`
   - `useActivities`
   - `useProjects`
   - `useContacts`
   - `useHealthScore`

3. **Hook Executes State Logic**  
   The hook manages:

   - local states (`loading`, `data`, `error`)
   - validation
   - data preparation

4. **Hook Calls Service or Supabase Client**  
   The hook uses:

   - `supabaseClient`
   - functions from the `services` layer
   - utilities from the `lib` layer

   This enables communication with:

   - the database
   - file storage
   - external integrations

5. **Result Returns to Hook**  
   After execution:

   - data is returned
   - errors are handled
   - state is updated

6. **UI Re‑renders**  
   State updates trigger a visual refresh of the interface.

---

## Read Flow (Data Fetch)

This flow describes how data is loaded when a page is opened.

Typical flow:

1. A page loads (e.g., Clients, Dashboard, Projects).
2. The initial component calls a read hook.

Examples:

- `useClients`
- `useActivities`
- `useProjects`
- `useContacts`
- `useSegments`
- `useStages`

3. The hook runs a `useEffect` to fetch data.
4. The hook uses:

   - `supabaseClient`
   - functions from the `lib` layer
   - configured external services

5. The data returns and is stored in the hook's state.
6. The component consumes this data and renders:

   - lists
   - cards
   - tables
   - charts

This pattern is used across virtually all system screens.

---

## Write Flow (Data Mutation)

This flow describes how data is created, updated, or removed.

### Creation

Examples:

- Create a client
- Register an activity
- Create a project

Flow:

1. User fills out a form.
2. Component sends the data to a hook.
3. The hook performs validations.
4. The hook calls:

   - `supabaseClient.insert`
   - or functions from the `services` layer

5. The record is persisted.
6. Local state is updated or data is re‑fetched.

---

### Update

Examples:

- Edit a client
- Update project status
- Modify an activity

Flow:

1. User changes existing data.
2. Hook calls an `update` operation.
3. The database is updated.
4. Local state reflects the change.

---

### Deletion

Examples:

- Remove an activity
- Delete a contact
- Soft‑delete attachments

Flow:

1. User confirms deletion.
2. Hook performs a delete operation.
3. The record is removed or marked inactive.
4. The interface is updated.

---

## Client Creation Flow with Lifecycle

When creating a new client, the system now considers the `lifecycle_stage` field which influences subsequent behavior.

### Flow Steps

1. **User creates a new client**  
   The user fills out the ClientForm in the UI, including the lifecycle_stage selection.

2. **lifecycle_stage is defined**  
   The user selects one of the available lifecycle values:
   - `lead` — Early-stage company
   - `prospect` — Qualified opportunity
   - `cliente` — Active customer
   - `parceiro` — Partner organization
   - `teste` — Temporary account

3. **Client record is inserted into the clients table**  
   The form submits the data to Supabase, including `lifecycle_stage`.

4. **Conditional logic determines catalog behavior**  
   Depending on the selected lifecycle_stage, different post-creation actions occur.

### Conditional Catalog Initialization

The catalog initialization follows the client's lifecycle:

**If lifecycle_stage = "cliente":**
- Default catalog records may be created automatically
- System may require at least one service to be selected
- Full operational features become available

**If lifecycle_stage ≠ "cliente":**
- Catalog initialization is skipped
- No services or solutions are pre-assigned
- Operational features are hidden from UI

This behavior prevents unnecessary data for leads and prospects while ensuring clients have the required catalog setup.

### Catalog Initialization Trigger

A database trigger may run after client insertion to handle initialization:

- **Trigger responsibility**: detect lifecycle_stage value
- **Action**: insert default catalog records when appropriate
- **Purpose**: reduce frontend complexity by handling initialization automatically

### Lifecycle-Dependent Processing

The lifecycle_stage acts as a control variable for downstream processes:

- **Health calculations** — Only processed for clients (lifecycle_stage = "cliente")
- **Operational tracking** — Hidden for leads and prospects
- **Catalog loading** — Conditional based on lifecycle
- **UI rendering logic** — Tabs like "Operacional" and "Health Score" are disabled for non-clients

This ensures that early-stage companies see only relevant information and the interface remains focused on appropriate actions for each lifecycle stage.

---

## Global State Flow

Global state is managed through:

```text
AuthContext