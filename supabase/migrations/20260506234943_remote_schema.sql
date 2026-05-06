alter table "public"."client_reports" drop constraint "client_reports_status_check";

alter table "public"."client_reports" add constraint "client_reports_status_check" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying])::text[]))) not valid;

alter table "public"."client_reports" validate constraint "client_reports_status_check";


