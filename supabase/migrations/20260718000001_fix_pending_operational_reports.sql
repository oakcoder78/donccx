-- Fix: update pending rows that already have data_os populated
-- (caused by EF v1 not setting status:'done' / processed_at)
update client_operational_reports
set status = 'done', processed_at = now()
where status = 'pending' and data_os is not null;
