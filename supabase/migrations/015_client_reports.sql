-- 015 — Relatório Mensal do Cliente (RMC)

-- ============================================================
-- Tabelas
-- ============================================================

create table if not exists client_reports (
  id             uuid        primary key default gen_random_uuid(),
  client_id      integer     references clients(id) on delete cascade,
  period         varchar(7)  not null,          -- YYYY-MM
  title          text        not null,
  sections       jsonb       default '{}',       -- conteúdo estruturado por seção
  html_content   text,                           -- snapshot HTML no momento da publicação
  created_by     uuid        references profiles(id),
  created_at     timestamptz default now(),
  published_at   timestamptz,
  public_token   uuid        default gen_random_uuid(),
  allowed_emails jsonb       default '[]',
  status         varchar(20) default 'draft'
    check (status in ('draft','published'))
);

create table if not exists report_views (
  id         uuid        primary key default gen_random_uuid(),
  report_id  uuid        references client_reports(id) on delete cascade,
  email      text,
  viewed_at  timestamptz default now()
);

-- ============================================================
-- RLS — client_reports
-- ============================================================
alter table client_reports enable row level security;

-- Admin / Manager: acesso total
drop policy if exists "reports_admin_manager" on client_reports;
create policy "reports_admin_manager"
  on client_reports for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin','manager')
    )
  );

-- CSM: somente relatórios dos próprios clientes
drop policy if exists "reports_csm_own" on client_reports;
create policy "reports_csm_own"
  on client_reports for all
  using (
    exists (
      select 1 from profiles p
      join clients c on c.csm_id = p.id
      where p.id = auth.uid()
        and p.role = 'csm'
        and c.id = client_reports.client_id
    )
  );

-- Anon: leitura de relatórios publicados (via token na rota pública)
drop policy if exists "reports_anon_published" on client_reports;
create policy "reports_anon_published"
  on client_reports for select
  to anon
  using (status = 'published');

-- ============================================================
-- RLS — report_views
-- ============================================================
alter table report_views enable row level security;

-- Qualquer pessoa pode inserir view (página pública)
drop policy if exists "views_insert_public" on report_views;
create policy "views_insert_public"
  on report_views for insert
  to anon, authenticated
  with check (true);

-- Usuários autenticados lêem views dos próprios clientes
drop policy if exists "views_select_auth" on report_views;
create policy "views_select_auth"
  on report_views for select
  using (
    exists (
      select 1 from client_reports cr
      join clients c on c.id = cr.client_id
      join profiles p on p.id = auth.uid()
      where cr.id = report_views.report_id
        and (p.role in ('admin','manager') or c.csm_id = p.id)
    )
  );

-- ============================================================
-- RPC: check_report_access
-- Verifica se o e-mail tem permissão de acessar o relatório.
-- Roda como SECURITY DEFINER (contorna RLS) — seguro pois só retorna
-- dados do relatório específico identificado pelo token UUID.
-- ============================================================
create or replace function check_report_access(p_token uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report       client_reports%rowtype;
  v_client       clients%rowtype;
  v_csm          profiles%rowtype;
  v_authorized   boolean := false;
  v_role         text    := null;
begin
  -- Busca o relatório pelo token
  select * into v_report
  from client_reports
  where public_token = p_token and status = 'published'
  limit 1;

  if not found then
    return jsonb_build_object('authorized', false, 'reason', 'not_found');
  end if;

  -- Dados do cliente
  select * into v_client from clients where id = v_report.client_id;

  -- Dados do CSM
  if v_client.csm_id is not null then
    select * into v_csm from profiles where id = v_client.csm_id;
  end if;

  -- Check 1: usuário do Hub (profiles)
  if exists (
    select 1 from profiles where lower(email) = lower(p_email)
  ) then
    v_authorized := true;
    v_role := 'Hub';
  end if;

  -- Check 2: e-mail na lista allowed_emails do relatório
  if not v_authorized then
    if v_report.allowed_emails @> to_jsonb(lower(p_email))
       or v_report.allowed_emails @> to_jsonb(p_email)
    then
      v_authorized := true;
      v_role := 'Autorizado';
    end if;
  end if;

  -- Check 3: contato (qualquer papel) vinculado ao cliente via contact_links
  if not v_authorized then
    select cl.papel into v_role
    from contacts ct
    join contact_links cl on cl.contact_id = ct.id
    where lower(ct.email) = lower(p_email)
      and cl.client_id = v_report.client_id
    order by
      (cl.champion)::int desc,
      (cl.papel = 'Decisor')::int desc
    limit 1;

    if found and v_role is not null then
      v_authorized := true;
    end if;
  end if;

  if not v_authorized then
    return jsonb_build_object(
      'authorized',  false,
      'reason',      'not_authorized',
      'csm_name',    v_csm.name,
      'csm_email',   v_csm.email
    );
  end if;

  -- Retorna autorizado com dados do relatório
  return jsonb_build_object(
    'authorized',   true,
    'contact_role', coalesce(v_role, 'Contato'),
    'report', jsonb_build_object(
      'id',           v_report.id,
      'title',        v_report.title,
      'period',       v_report.period,
      'html_content', v_report.html_content,
      'client_name',  coalesce(v_client.fantasy_name, v_client.name)
    ),
    'csm_name',   v_csm.name,
    'csm_email',  v_csm.email
  );
end;
$$;

-- ============================================================
-- RPC: register_report_view
-- Registra a visualização e cria atividade automática.
-- Roda como SECURITY DEFINER pois a página pública não tem auth.
-- ============================================================
create or replace function register_report_view(
  p_report_id    uuid,
  p_email        text,
  p_contact_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id integer;
  v_period    varchar;
  v_csm_id    uuid;
  v_desc      text;
begin
  -- Dados do relatório/cliente
  select cr.client_id, cr.period, c.csm_id
  into v_client_id, v_period, v_csm_id
  from client_reports cr
  join clients c on c.id = cr.client_id
  where cr.id = p_report_id;

  if not found then return; end if;

  -- Registra a view
  insert into report_views (report_id, email)
  values (p_report_id, lower(p_email))
  on conflict do nothing;

  -- Monta descrição da atividade
  v_desc := 'Relatório de ' || v_period || ' visualizado por ' || p_email;
  if p_contact_role is not null and p_contact_role <> 'Hub' then
    v_desc := v_desc || ' (' || p_contact_role || ')';
  end if;

  -- Cria atividade automática do tipo nota
  insert into activities (
    type, title, description,
    client_id, responsible_id,
    activity_date, status
  ) values (
    'nota',
    'RMC visualizado',
    v_desc,
    v_client_id,
    v_csm_id,
    current_date,
    'concluida'
  );
end;
$$;

-- Permissões para anon chamar os RPCs
grant execute on function check_report_access(uuid, text)           to anon;
grant execute on function register_report_view(uuid, text, text)    to anon;
