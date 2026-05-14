-- brief_csm_notes: internal notes on brief instances, optionally visible to client
create table if not exists brief_csm_notes (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references brief_instances(id) on delete cascade,
  note_text text not null,
  is_visible boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function update_brief_csm_notes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger brief_csm_notes_updated_at
  before update on brief_csm_notes
  for each row execute function update_brief_csm_notes_updated_at();

-- RLS
alter table brief_csm_notes enable row level security;

-- authenticated users (internal hub) can read all notes for instances they can access
create policy "brief_csm_notes_select" on brief_csm_notes
  for select to authenticated
  using (true);

-- authenticated users can insert their own notes
create policy "brief_csm_notes_insert" on brief_csm_notes
  for insert to authenticated
  with check (created_by = auth.uid());

-- note owner can update
create policy "brief_csm_notes_update" on brief_csm_notes
  for update to authenticated
  using (created_by = auth.uid());

-- note owner can delete
create policy "brief_csm_notes_delete" on brief_csm_notes
  for delete to authenticated
  using (created_by = auth.uid());
