-- Copy orphaned Lojas MM months (01-03) from client_id=1067 (saas_id) to client_id=3 (real)
-- EF v1 stored data under saas_id instead of client_id

insert into client_operational_reports (client_id, period, status, data_os, data_produtividade, processed_at, updated_at)
select
  3 as client_id,
  period,
  status,
  data_os,
  data_produtividade,
  now() as processed_at,
  now() as updated_at
from client_operational_reports src
where src.client_id = 1067
  and src.period in ('2026-01', '2026-02', '2026-03')
  and not exists (
    select 1 from client_operational_reports tgt
    where tgt.client_id = 3
      and tgt.period = src.period
  );
