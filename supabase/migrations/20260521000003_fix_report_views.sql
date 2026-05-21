-- ─── unique constraint on report_views ─────────────────────────────────
ALTER TABLE public.report_views
  ADD CONSTRAINT report_views_report_id_email_key UNIQUE (report_id, email);

-- ─── update register_report_view ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_report_view(
  p_report_id    uuid,
  p_email        text,
  p_contact_role text default null
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Registra a view (dedup via unique constraint)
  insert into report_views (report_id, email)
  values (p_report_id, lower(p_email))
  on conflict (report_id, email) do nothing;

  -- Cria atividade automática (protegida: falha não quebra a view)
  begin
    v_desc := 'Relatório de ' || v_period || ' visualizado por ' || p_email;
    if p_contact_role is not null and p_contact_role <> 'Hub' then
      v_desc := v_desc || ' (' || p_contact_role || ')';
    end if;

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
  exception when others then
    null;
  end;
end;
$$;
