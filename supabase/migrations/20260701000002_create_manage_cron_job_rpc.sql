create or replace function public.manage_cron_job(
  p_action text,
  p_job_name text default 'monthly-sync-job',
  p_schedule text default null,
  p_url text default null,
  p_body jsonb default '{}'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public, cron, vault
as $$
declare
  v_sql text;
  v_base_url text;
  v_job record;
begin
  v_base_url := coalesce(p_url, 'https://etfeqblaeuhaobefxilp.supabase.co/functions/v1/monthly-sync');

  if p_action = 'get_config' then
    select jobname, schedule, active
    into v_job
    from cron.job
    where jobname = p_job_name;
    if v_job.jobname is null then
      return json_build_object('job_name', p_job_name, 'schedule', null, 'active', false);
    end if;
    return json_build_object(
      'job_name', v_job.jobname,
      'schedule', v_job.schedule,
      'active', v_job.active
    );

  elsif p_action = 'unschedule' then
    perform cron.unschedule(p_job_name);
    return json_build_object('status', 'unscheduled', 'job_name', p_job_name);

  elsif p_action = 'schedule' then
    if p_schedule is null then
      raise exception 'schedule is required for action schedule';
    end if;
    perform cron.unschedule(p_job_name);
    v_sql := format(
      'select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          ''Content-Type'', ''application/json'',
          ''x-webhook-secret'', (select decrypted_secret from vault.decrypted_secrets where name = ''sync_webhook_secret'')
        ),
        body := %L::jsonb
      )',
      v_base_url,
      coalesce(p_body::text, '{}')
    );
    perform cron.schedule(p_job_name, p_schedule, v_sql);
    return json_build_object('status', 'scheduled', 'job_name', p_job_name, 'schedule', p_schedule);

  else
    raise exception 'unknown action: %', p_action;
  end if;
end;
$$;
