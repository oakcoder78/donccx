


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."check_marco_evidence"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Só valida quando status muda para concluida pela primeira vez
  IF NEW.status != 'concluida' OR OLD.status = 'concluida' THEN
    RETURN NEW;
  END IF;

  -- Verifica se é um marco que requer evidência
  IF NOT NEW.evidence_required THEN
    RETURN NEW;
  END IF;

  -- Justificativa preenchida libera
  IF NEW.justificativa IS NOT NULL AND trim(NEW.justificativa) != '' THEN
    RETURN NEW;
  END IF;

  -- Verifica se existe evidência registrada
  IF NOT EXISTS (
    SELECT 1 FROM public.onboarding_evidencias
    WHERE fase_id = NEW.id
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Este marco requer uma evidência registrada ou uma justificativa para ser concluído.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_marco_evidence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_report_access"("p_token" "uuid", "p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."check_report_access"("p_token" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_fases"("p_onboarding_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_type record;
  v_order integer := 0;
BEGIN
  FOR v_type IN
    SELECT id, is_milestone, requires_evidence, display_order
    FROM public.onboarding_fase_types
    WHERE active = true
    ORDER BY display_order
  LOOP
    v_order := v_order + 1;
    INSERT INTO public.onboarding_fases (
      onboarding_id, fase_type_id, display_order,
      status, evidence_required
    ) VALUES (
      p_onboarding_id,
      v_type.id,
      v_type.display_order,
      CASE WHEN v_order = 1 THEN 'ativa' ELSE 'pendente' END,
      v_type.requires_evidence
    )
    ON CONFLICT (onboarding_id, fase_type_id) DO NOTHING;
  END LOOP;

  -- Define fase_atual_id como a primeira fase (ativa)
  UPDATE public.onboardings
  SET fase_atual_id = (
    SELECT id FROM public.onboarding_fases
    WHERE onboarding_id = p_onboarding_id
    ORDER BY display_order
    LIMIT 1
  )
  WHERE id = p_onboarding_id;
END;
$$;


ALTER FUNCTION "public"."create_default_fases"("p_onboarding_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_client_catalog_history"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) OR TG_OP = 'INSERT' THEN
    INSERT INTO client_catalog_history
      (client_catalog_id, client_id, catalog_item_id, status_anterior, status_novo, changed_at)
    VALUES (
      NEW.id,
      NEW.client_id,
      NEW.catalog_item_id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      NEW.status,
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_client_catalog_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'csm'),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_situacao_geral"("p_onboarding_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.onboardings
  SET situacao_geral = CASE
    -- Travado: pendência bloqueadora ativa
    WHEN EXISTS (
      SELECT 1 FROM public.onboarding_pendencias
      WHERE onboarding_id = p_onboarding_id
        AND prioridade = 'bloqueadora'
        AND status != 'encerrada'
    ) THEN 'travado'
    -- Atenção: prazo vencido em pendência aberta
    -- OU pendência alta aberta há mais de 7 dias
    -- OU marco com planned_end vencido sem conclusão
    WHEN EXISTS (
      SELECT 1 FROM public.onboarding_pendencias
      WHERE onboarding_id = p_onboarding_id
        AND status != 'encerrada'
        AND (
          (due_date IS NOT NULL AND due_date < CURRENT_DATE)
          OR (prioridade = 'alta' AND created_at < now() - interval '7 days')
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.onboarding_fases f
      JOIN public.onboarding_fase_types ft ON ft.id = f.fase_type_id
      WHERE f.onboarding_id = p_onboarding_id
        AND f.status != 'concluida'
        AND f.planned_end IS NOT NULL
        AND f.planned_end < CURRENT_DATE
    ) THEN 'atencao'
    ELSE 'fluindo'
  END,
  updated_at = now()
  WHERE id = p_onboarding_id;
END;
$$;


ALTER FUNCTION "public"."recalculate_situacao_geral"("p_onboarding_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_report_view"("p_report_id" "uuid", "p_email" "text", "p_contact_role" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."register_report_view"("p_report_id" "uuid", "p_email" "text", "p_contact_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_update_situacao_geral"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_situacao_geral(OLD.onboarding_id);
  ELSE
    PERFORM public.recalculate_situacao_geral(NEW.onboarding_id);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trg_fn_update_situacao_geral"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."access_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "access_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'invited'::"text", 'rejected'::"text", 'approved'::"text"])))
);


ALTER TABLE "public"."access_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" integer NOT NULL,
    "type" "text" NOT NULL,
    "title" "text",
    "description" "text" NOT NULL,
    "client_id" integer,
    "contact_id" integer,
    "responsible_id" "uuid",
    "activity_date" "date" NOT NULL,
    "activity_time" time without time zone,
    "status" "text" DEFAULT 'pendente'::"text",
    "due_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "activities_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'concluida'::"text"]))),
    CONSTRAINT "activities_type_check" CHECK (("type" = ANY (ARRAY['reuniao'::"text", 'ligacao'::"text", 'email'::"text", 'whatsapp'::"text", 'tarefa'::"text", 'nota'::"text", 'relatorio'::"text"])))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."activities_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."activities_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."activities_id_seq" OWNED BY "public"."activities"."id";



CREATE TABLE IF NOT EXISTS "public"."activity_attachments" (
    "id" integer NOT NULL,
    "activity_id" integer,
    "file_name" "text" NOT NULL,
    "file_size" integer,
    "file_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" integer,
    "uploaded_by" "uuid",
    "file_type" "text",
    "storage_path" "text",
    "is_deleted" boolean DEFAULT false
);


ALTER TABLE "public"."activity_attachments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."activity_attachments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."activity_attachments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."activity_attachments_id_seq" OWNED BY "public"."activity_attachments"."id";



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "user_name" "text",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "entity_name" "text",
    "old_value" "jsonb",
    "new_value" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


ALTER TABLE "public"."audit_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."catalog_items" (
    "id" integer NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#173557'::"text",
    CONSTRAINT "catalog_items_type_check" CHECK (("type" = ANY (ARRAY['servico'::"text", 'solucao'::"text"])))
);


ALTER TABLE "public"."catalog_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."catalog_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."catalog_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."catalog_items_id_seq" OWNED BY "public"."catalog_items"."id";



CREATE TABLE IF NOT EXISTS "public"."client_catalog" (
    "client_id" integer NOT NULL,
    "catalog_item_id" integer NOT NULL,
    "id" bigint NOT NULL,
    "status" "text" DEFAULT 'implantado'::"text"
);


ALTER TABLE "public"."client_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_catalog_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_catalog_id" bigint,
    "client_id" integer NOT NULL,
    "catalog_item_id" integer NOT NULL,
    "status_anterior" "text",
    "status_novo" "text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by" "uuid"
);


ALTER TABLE "public"."client_catalog_history" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."client_catalog_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."client_catalog_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."client_catalog_id_seq" OWNED BY "public"."client_catalog"."id";



CREATE TABLE IF NOT EXISTS "public"."client_donc_instances" (
    "id" integer NOT NULL,
    "client_id" integer NOT NULL,
    "contrato_saas_id" integer NOT NULL,
    "label" "text" NOT NULL,
    "url_donc" "text",
    "app_code" "text",
    "weight" numeric(4,3) DEFAULT 1.0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."client_donc_instances" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."client_donc_instances_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."client_donc_instances_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."client_donc_instances_id_seq" OWNED BY "public"."client_donc_instances"."id";



CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "cnpj" "text",
    "segment" "text",
    "csm_id" "uuid",
    "stage_id" integer,
    "stage_override" boolean DEFAULT false,
    "abc_class" "text",
    "mrr" numeric DEFAULT 0,
    "licencas" integer DEFAULT 0,
    "valor_lic" numeric DEFAULT 0,
    "contract_start" "date",
    "contract_renewal" "date",
    "delay_days" integer DEFAULT 0,
    "app_code" "text",
    "url_donc" "text",
    "onb_start" "date",
    "golive" "date",
    "health_uso" integer DEFAULT 0,
    "health_suporte" integer DEFAULT 0,
    "health_relacionamento" integer DEFAULT 0,
    "health_financeiro" integer DEFAULT 0,
    "health_projeto" integer DEFAULT 0,
    "health_total" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "fantasy_name" "text",
    "logo_url" "text",
    "contract_active" boolean DEFAULT true,
    "unidades_total" integer DEFAULT 0,
    "unidades_donc" integer DEFAULT 0,
    "segment_id" integer,
    "site" "text",
    "address_cep" "text",
    "address_street" "text",
    "address_number" "text",
    "address_complement" "text",
    "address_neighborhood" "text",
    "address_city" "text",
    "address_state" "text",
    "billing_type" "text" DEFAULT 'por_licenca'::"text",
    "billing_base_value" numeric DEFAULT 0,
    "billing_floor" integer DEFAULT 0,
    "contract_signed_date" "date",
    "correction_index" "text",
    "description" "text",
    "freshdesk_company_id" bigint,
    "health_calculated_at" timestamp with time zone,
    "freshdesk_company_ids" bigint[],
    "csm_temperature" integer DEFAULT 0,
    "temperature_updated_at" timestamp with time zone,
    "temperature_note" "text",
    "lifecycle_stage" "text" DEFAULT 'lead'::"text" NOT NULL,
    CONSTRAINT "clients_abc_class_check" CHECK (("abc_class" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"]))),
    CONSTRAINT "clients_billing_type_check" CHECK (("billing_type" = ANY (ARRAY['por_licenca'::"text", 'por_os'::"text"]))),
    CONSTRAINT "clients_lifecycle_stage_check" CHECK (("lifecycle_stage" = ANY (ARRAY['lead'::"text", 'prospect'::"text", 'cliente'::"text", 'parceiro'::"text", 'teste'::"text"])))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."client_penetration" WITH ("security_invoker"='on') AS
 SELECT "id",
    "name",
    "unidades_total",
    "unidades_donc",
        CASE
            WHEN ("unidades_total" > 0) THEN "round"(((("unidades_donc")::numeric / ("unidades_total")::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS "penetration_pct"
   FROM "public"."clients";


ALTER VIEW "public"."client_penetration" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" integer,
    "period" character varying(7) NOT NULL,
    "title" "text" NOT NULL,
    "sections" "jsonb" DEFAULT '{}'::"jsonb",
    "html_content" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "published_at" timestamp with time zone,
    "public_token" "uuid" DEFAULT "gen_random_uuid"(),
    "allowed_emails" "jsonb" DEFAULT '[]'::"jsonb",
    "status" character varying(20) DEFAULT 'draft'::character varying,
    CONSTRAINT "client_reports_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['draft'::character varying, 'published'::character varying])::"text"[])))
);


ALTER TABLE "public"."client_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_support" (
    "id" integer NOT NULL,
    "client_id" integer,
    "ref_month" "text" NOT NULL,
    "tickets_opened" integer DEFAULT 0,
    "tickets_resolved" integer DEFAULT 0,
    "sla_first_response" integer DEFAULT 0,
    "n1_pct" integer DEFAULT 0,
    "n2_pct" integer DEFAULT 0,
    "n3_pct" integer DEFAULT 0,
    "pending" boolean DEFAULT false,
    "freshdesk_snapshot" "jsonb"
);


ALTER TABLE "public"."client_support" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."client_support_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."client_support_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."client_support_id_seq" OWNED BY "public"."client_support"."id";



CREATE TABLE IF NOT EXISTS "public"."client_usage" (
    "id" integer NOT NULL,
    "client_id" integer,
    "ref_month" "text" NOT NULL,
    "os_created" integer DEFAULT 0,
    "active_users" integer DEFAULT 0,
    "instance_id" integer,
    "os_finalizadas" integer,
    "os_abertas" integer,
    "os_canceladas" integer,
    "profissionais_inativos" integer,
    "unidades" integer,
    "os_por_tipo" "jsonb",
    "pending" boolean DEFAULT false,
    "donc_snapshot" "jsonb",
    "partial_day" integer
);


ALTER TABLE "public"."client_usage" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."client_usage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."client_usage_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."client_usage_id_seq" OWNED BY "public"."client_usage"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."clients_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."clients_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."clients_id_seq" OWNED BY "public"."clients"."id";



CREATE TABLE IF NOT EXISTS "public"."contact_emails" (
    "id" integer NOT NULL,
    "contact_id" integer,
    "email" "text" NOT NULL,
    "type" "text" DEFAULT 'work'::"text",
    "is_primary" boolean DEFAULT false,
    CONSTRAINT "contact_emails_type_check" CHECK (("type" = ANY (ARRAY['work'::"text", 'personal'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."contact_emails" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contact_emails_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."contact_emails_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contact_emails_id_seq" OWNED BY "public"."contact_emails"."id";



CREATE TABLE IF NOT EXISTS "public"."contact_links" (
    "id" integer NOT NULL,
    "contact_id" integer,
    "client_id" integer,
    "papel" "text" DEFAULT 'Usuário'::"text",
    "engajamento" "text" DEFAULT 'Médio'::"text",
    "champion" boolean DEFAULT false,
    CONSTRAINT "contact_links_engajamento_check" CHECK (("engajamento" = ANY (ARRAY['Alto'::"text", 'Médio'::"text", 'Baixo'::"text"]))),
    CONSTRAINT "contact_links_papel_check" CHECK (("papel" = ANY (ARRAY['Decisor'::"text", 'Influenciador'::"text", 'Usuário'::"text", 'Técnico'::"text"])))
);


ALTER TABLE "public"."contact_links" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contact_links_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."contact_links_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contact_links_id_seq" OWNED BY "public"."contact_links"."id";



CREATE TABLE IF NOT EXISTS "public"."contact_phones" (
    "id" integer NOT NULL,
    "contact_id" integer,
    "number" "text" NOT NULL,
    "type" "text" DEFAULT 'Celular'::"text",
    CONSTRAINT "contact_phones_type_check" CHECK (("type" = ANY (ARRAY['WhatsApp'::"text", 'Celular'::"text", 'Fixo'::"text"])))
);


ALTER TABLE "public"."contact_phones" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contact_phones_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."contact_phones_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contact_phones_id_seq" OWNED BY "public"."contact_phones"."id";



CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "cargo" "text",
    "email" "text",
    "linkedin" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contacts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."contacts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contacts_id_seq" OWNED BY "public"."contacts"."id";



CREATE TABLE IF NOT EXISTS "public"."donkie_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "system_prompt" "text",
    "personality" "text",
    "domain_context" "text",
    "allow_cross_client" boolean DEFAULT true,
    "default_mode" character varying(20) DEFAULT 'discussao'::character varying,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."donkie_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donkie_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "client_id" integer,
    "route" "text",
    "messages" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."donkie_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_flags" (
    "id" integer NOT NULL,
    "key" "text" NOT NULL,
    "enabled" boolean DEFAULT false,
    "allowed_roles" "text"[] DEFAULT ARRAY['admin'::"text", 'manager'::"text", 'csm'::"text", 'analyst'::"text"],
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feature_flags" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."feature_flags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."feature_flags_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."feature_flags_id_seq" OWNED BY "public"."feature_flags"."id";



CREATE TABLE IF NOT EXISTS "public"."freshdesk_config" (
    "id" integer NOT NULL,
    "key" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."freshdesk_config" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."freshdesk_config_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."freshdesk_config_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."freshdesk_config_id_seq" OWNED BY "public"."freshdesk_config"."id";



CREATE TABLE IF NOT EXISTS "public"."health_config" (
    "id" integer NOT NULL,
    "threshold_healthy" integer DEFAULT 75,
    "threshold_attention" integer DEFAULT 50
);


ALTER TABLE "public"."health_config" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."health_config_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."health_config_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."health_config_id_seq" OWNED BY "public"."health_config"."id";



CREATE TABLE IF NOT EXISTS "public"."health_dimension_weights" (
    "id" bigint NOT NULL,
    "stage_group" "text" NOT NULL,
    "dimension" "text" NOT NULL,
    "weight" integer DEFAULT 20 NOT NULL
);


ALTER TABLE "public"."health_dimension_weights" OWNER TO "postgres";


ALTER TABLE "public"."health_dimension_weights" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."health_dimension_weights_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."health_rules" (
    "id" integer NOT NULL,
    "dimension" "text" NOT NULL,
    "label" "text" NOT NULL,
    "rule_key" "text" NOT NULL,
    "points" integer DEFAULT 0
);


ALTER TABLE "public"."health_rules" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."health_rules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."health_rules_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."health_rules_id_seq" OWNED BY "public"."health_rules"."id";



CREATE TABLE IF NOT EXISTS "public"."health_score_history" (
    "id" bigint NOT NULL,
    "client_id" integer NOT NULL,
    "ref_month" "text" NOT NULL,
    "health_uso" integer DEFAULT 0 NOT NULL,
    "health_suporte" integer DEFAULT 0 NOT NULL,
    "health_relacionamento" integer DEFAULT 0 NOT NULL,
    "health_financeiro" integer DEFAULT 0 NOT NULL,
    "health_projeto" integer DEFAULT 0 NOT NULL,
    "health_total" integer DEFAULT 0 NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."health_score_history" OWNER TO "postgres";


ALTER TABLE "public"."health_score_history" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."health_score_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."module_pricing" (
    "id" integer NOT NULL,
    "client_id" integer,
    "catalog_item_id" integer,
    "additional_value" numeric DEFAULT 0
);


ALTER TABLE "public"."module_pricing" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."module_pricing_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."module_pricing_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."module_pricing_id_seq" OWNED BY "public"."module_pricing"."id";



CREATE TABLE IF NOT EXISTS "public"."onboarding_activities" (
    "id" integer NOT NULL,
    "onboarding_id" integer NOT NULL,
    "activity_type_id" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "responsible_contato_id" integer,
    "responsible_interno_id" "uuid",
    "due_date" "date",
    "completed_at" timestamp with time zone,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fase_id" integer,
    CONSTRAINT "onboarding_activities_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_andamento'::"text", 'concluida'::"text"])))
);


ALTER TABLE "public"."onboarding_activities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."onboarding_activities_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."onboarding_activities_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."onboarding_activities_id_seq" OWNED BY "public"."onboarding_activities"."id";



CREATE TABLE IF NOT EXISTS "public"."onboarding_activity_types" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."onboarding_activity_types" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."onboarding_activity_types_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."onboarding_activity_types_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."onboarding_activity_types_id_seq" OWNED BY "public"."onboarding_activity_types"."id";



CREATE TABLE IF NOT EXISTS "public"."onboarding_capabilities" (
    "id" integer NOT NULL,
    "onboarding_id" integer NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "catalog_item_id" integer
);


ALTER TABLE "public"."onboarding_capabilities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."onboarding_capabilities_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."onboarding_capabilities_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."onboarding_capabilities_id_seq" OWNED BY "public"."onboarding_capabilities"."id";



CREATE TABLE IF NOT EXISTS "public"."onboarding_config" (
    "id" integer NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."onboarding_config" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."onboarding_config_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."onboarding_config_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."onboarding_config_id_seq" OWNED BY "public"."onboarding_config"."id";



CREATE TABLE IF NOT EXISTS "public"."onboarding_evidencias" (
    "id" integer NOT NULL,
    "pendencia_id" integer,
    "uploaded_by" "uuid" NOT NULL,
    "client_id" integer NOT NULL,
    "file_name" "text",
    "file_size" integer,
    "file_type" "text",
    "storage_path" "text",
    "evidence_text" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fase_id" integer,
    CONSTRAINT "chk_evidencia_target" CHECK (((("pendencia_id" IS NOT NULL) AND ("fase_id" IS NULL)) OR (("pendencia_id" IS NULL) AND ("fase_id" IS NOT NULL))))
);


ALTER TABLE "public"."onboarding_evidencias" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."onboarding_evidencias_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."onboarding_evidencias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."onboarding_evidencias_id_seq" OWNED BY "public"."onboarding_evidencias"."id";



CREATE TABLE IF NOT EXISTS "public"."onboarding_fase_types" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_milestone" boolean DEFAULT false NOT NULL,
    "requires_evidence" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."onboarding_fase_types" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."onboarding_fase_types_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."onboarding_fase_types_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."onboarding_fase_types_id_seq" OWNED BY "public"."onboarding_fase_types"."id";



CREATE TABLE IF NOT EXISTS "public"."onboarding_fases" (
    "id" integer NOT NULL,
    "onboarding_id" integer NOT NULL,
    "fase_type_id" integer NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "planned_start" "date",
    "planned_end" "date",
    "actual_start" "date",
    "actual_end" "date",
    "occurred_at" timestamp with time zone,
    "evidence_required" boolean DEFAULT false NOT NULL,
    "justificativa" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_fases_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'ativa'::"text", 'concluida'::"text"])))
);


ALTER TABLE "public"."onboarding_fases" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."onboarding_fases_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."onboarding_fases_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."onboarding_fases_id_seq" OWNED BY "public"."onboarding_fases"."id";



CREATE TABLE IF NOT EXISTS "public"."onboarding_pendencias" (
    "id" integer NOT NULL,
    "onboarding_id" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "prioridade" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'criada'::"text" NOT NULL,
    "responsavel_contato_id" integer,
    "responsavel_interno_id" "uuid",
    "responsavel_grupo" "text",
    "due_date" "date",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activity_id" integer,
    "fase_id" integer,
    CONSTRAINT "chk_responsavel" CHECK ((("responsavel_contato_id" IS NOT NULL) OR ("responsavel_interno_id" IS NOT NULL) OR ("responsavel_grupo" IS NOT NULL))),
    CONSTRAINT "onboarding_pendencias_prioridade_check" CHECK (("prioridade" = ANY (ARRAY['bloqueadora'::"text", 'alta'::"text", 'normal'::"text"]))),
    CONSTRAINT "onboarding_pendencias_status_check" CHECK (("status" = ANY (ARRAY['criada'::"text", 'em_andamento'::"text", 'aguardando_validacao'::"text", 'encerrada'::"text"])))
);


ALTER TABLE "public"."onboarding_pendencias" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."onboarding_pendencias_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."onboarding_pendencias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."onboarding_pendencias_id_seq" OWNED BY "public"."onboarding_pendencias"."id";



CREATE TABLE IF NOT EXISTS "public"."onboardings" (
    "id" integer NOT NULL,
    "client_id" integer NOT NULL,
    "csm_id" "uuid",
    "title" "text" NOT NULL,
    "context" "text" DEFAULT 'implantacao_inicial'::"text" NOT NULL,
    "situacao_geral" "text" DEFAULT 'fluindo'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "notes" "text",
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fase_atual_id" integer,
    CONSTRAINT "onboardings_context_check" CHECK (("context" = ANY (ARRAY['implantacao_inicial'::"text", 'expansao'::"text"]))),
    CONSTRAINT "onboardings_situacao_geral_check" CHECK (("situacao_geral" = ANY (ARRAY['fluindo'::"text", 'atencao'::"text", 'travado'::"text"]))),
    CONSTRAINT "onboardings_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'encerrado'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."onboardings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."onboardings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."onboardings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."onboardings_id_seq" OWNED BY "public"."onboardings"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'csm'::"text",
    "csm_id" integer,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "avatar_url" "text",
    "email_secondary" "text",
    "phone" "text",
    "phone_is_whatsapp" boolean DEFAULT false,
    "gender" "text",
    CONSTRAINT "profiles_gender_check" CHECK (("gender" = ANY (ARRAY['masculino'::"text", 'feminino'::"text", 'outro'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'csm'::"text", 'analyst'::"text"]))),
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'pending'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_template_activities" (
    "id" integer NOT NULL,
    "template_id" integer NOT NULL,
    "fase_type_id" integer NOT NULL,
    "activity_type_id" integer NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."project_template_activities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."project_template_activities_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."project_template_activities_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."project_template_activities_id_seq" OWNED BY "public"."project_template_activities"."id";



CREATE TABLE IF NOT EXISTS "public"."project_template_fases" (
    "id" integer NOT NULL,
    "template_id" integer NOT NULL,
    "fase_type_id" integer NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "requires_evidence" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."project_template_fases" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."project_template_fases_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."project_template_fases_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."project_template_fases_id_seq" OWNED BY "public"."project_template_fases"."id";



CREATE TABLE IF NOT EXISTS "public"."project_templates" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "description" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_templates_type_check" CHECK (("type" = ANY (ARRAY['onboarding'::"text", 'expansao'::"text", 'interno'::"text"])))
);


ALTER TABLE "public"."project_templates" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."project_templates_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."project_templates_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."project_templates_id_seq" OWNED BY "public"."project_templates"."id";



CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" integer NOT NULL,
    "client_id" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "responsible_id" "uuid",
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'em_andamento'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" DEFAULT 'interno'::"text" NOT NULL,
    "onboarding_id" integer,
    CONSTRAINT "chk_project_onboarding_id" CHECK (((("type" = ANY (ARRAY['onboarding'::"text", 'expansao'::"text"])) AND ("onboarding_id" IS NOT NULL)) OR (("type" = 'interno'::"text") AND ("onboarding_id" IS NULL)))),
    CONSTRAINT "projects_status_check" CHECK (("status" = ANY (ARRAY['planejado'::"text", 'em_andamento'::"text", 'concluido'::"text", 'suspenso'::"text"]))),
    CONSTRAINT "projects_type_check" CHECK (("type" = ANY (ARRAY['onboarding'::"text", 'expansao'::"text", 'interno'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."projects_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."projects_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."projects_id_seq" OWNED BY "public"."projects"."id";



CREATE TABLE IF NOT EXISTS "public"."report_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid",
    "email" "text",
    "viewed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."report_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."segments" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."segments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."segments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."segments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."segments_id_seq" OWNED BY "public"."segments"."id";



CREATE TABLE IF NOT EXISTS "public"."stages" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#59c2ed'::"text",
    "description" "text",
    "display_order" integer DEFAULT 0
);


ALTER TABLE "public"."stages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."stages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."stages_id_seq" OWNED BY "public"."stages"."id";



CREATE TABLE IF NOT EXISTS "public"."whatsapp_tickets" (
    "id" integer NOT NULL,
    "analyst_id" "uuid" NOT NULL,
    "client_id" integer NOT NULL,
    "contact_id" integer,
    "freshdesk_ticket_id" integer,
    "subject" "text",
    "ref_month" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."whatsapp_tickets" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."whatsapp_tickets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."whatsapp_tickets_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."whatsapp_tickets_id_seq" OWNED BY "public"."whatsapp_tickets"."id";



ALTER TABLE ONLY "public"."activities" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."activities_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_attachments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."activity_attachments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."catalog_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."catalog_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."client_catalog" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."client_catalog_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."client_donc_instances" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."client_donc_instances_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."client_support" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."client_support_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."client_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."client_usage_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."clients" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."clients_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contact_emails" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contact_emails_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contact_links" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contact_links_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contact_phones" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contact_phones_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contacts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contacts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."feature_flags" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."feature_flags_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."freshdesk_config" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."freshdesk_config_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."health_config" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."health_config_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."health_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."health_rules_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."module_pricing" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."module_pricing_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."onboarding_activities" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."onboarding_activities_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."onboarding_activity_types" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."onboarding_activity_types_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."onboarding_capabilities" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."onboarding_capabilities_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."onboarding_config" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."onboarding_config_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."onboarding_evidencias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."onboarding_evidencias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."onboarding_fase_types" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."onboarding_fase_types_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."onboarding_fases" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."onboarding_fases_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."onboarding_pendencias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."onboarding_pendencias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."onboardings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."onboardings_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."project_template_activities" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."project_template_activities_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."project_template_fases" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."project_template_fases_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."project_templates" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."project_templates_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."projects" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."projects_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."segments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."segments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."whatsapp_tickets" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."whatsapp_tickets_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."access_requests"
    ADD CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_attachments"
    ADD CONSTRAINT "activity_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_catalog_history"
    ADD CONSTRAINT "client_catalog_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_catalog"
    ADD CONSTRAINT "client_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_catalog"
    ADD CONSTRAINT "client_catalog_unique_pair" UNIQUE ("client_id", "catalog_item_id");



ALTER TABLE ONLY "public"."client_donc_instances"
    ADD CONSTRAINT "client_donc_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_reports"
    ADD CONSTRAINT "client_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_support"
    ADD CONSTRAINT "client_support_client_id_ref_month_key" UNIQUE ("client_id", "ref_month");



ALTER TABLE ONLY "public"."client_support"
    ADD CONSTRAINT "client_support_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_usage"
    ADD CONSTRAINT "client_usage_client_id_ref_month_instance_key" UNIQUE ("client_id", "ref_month", "instance_id");



ALTER TABLE ONLY "public"."client_usage"
    ADD CONSTRAINT "client_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_emails"
    ADD CONSTRAINT "contact_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_links"
    ADD CONSTRAINT "contact_links_contact_id_client_id_key" UNIQUE ("contact_id", "client_id");



ALTER TABLE ONLY "public"."contact_links"
    ADD CONSTRAINT "contact_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_phones"
    ADD CONSTRAINT "contact_phones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donkie_config"
    ADD CONSTRAINT "donkie_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donkie_conversations"
    ADD CONSTRAINT "donkie_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."freshdesk_config"
    ADD CONSTRAINT "freshdesk_config_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."freshdesk_config"
    ADD CONSTRAINT "freshdesk_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_config"
    ADD CONSTRAINT "health_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_dimension_weights"
    ADD CONSTRAINT "health_dimension_weights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_dimension_weights"
    ADD CONSTRAINT "health_dimension_weights_stage_dim" UNIQUE ("stage_group", "dimension");



ALTER TABLE ONLY "public"."health_rules"
    ADD CONSTRAINT "health_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_score_history"
    ADD CONSTRAINT "health_score_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."module_pricing"
    ADD CONSTRAINT "module_pricing_client_id_catalog_item_id_key" UNIQUE ("client_id", "catalog_item_id");



ALTER TABLE ONLY "public"."module_pricing"
    ADD CONSTRAINT "module_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_activities"
    ADD CONSTRAINT "onboarding_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_activity_types"
    ADD CONSTRAINT "onboarding_activity_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."onboarding_activity_types"
    ADD CONSTRAINT "onboarding_activity_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_capabilities"
    ADD CONSTRAINT "onboarding_capabilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_config"
    ADD CONSTRAINT "onboarding_config_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."onboarding_config"
    ADD CONSTRAINT "onboarding_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_evidencias"
    ADD CONSTRAINT "onboarding_evidencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_fase_types"
    ADD CONSTRAINT "onboarding_fase_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."onboarding_fase_types"
    ADD CONSTRAINT "onboarding_fase_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_fases"
    ADD CONSTRAINT "onboarding_fases_onboarding_id_fase_type_id_key" UNIQUE ("onboarding_id", "fase_type_id");



ALTER TABLE ONLY "public"."onboarding_fases"
    ADD CONSTRAINT "onboarding_fases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_pendencias"
    ADD CONSTRAINT "onboarding_pendencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboardings"
    ADD CONSTRAINT "onboardings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_csm_id_key" UNIQUE ("csm_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_template_activities"
    ADD CONSTRAINT "project_template_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_template_fases"
    ADD CONSTRAINT "project_template_fases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_templates"
    ADD CONSTRAINT "project_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_views"
    ADD CONSTRAINT "report_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."segments"
    ADD CONSTRAINT "segments_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."segments"
    ADD CONSTRAINT "segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stages"
    ADD CONSTRAINT "stages_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."stages"
    ADD CONSTRAINT "stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_tickets"
    ADD CONSTRAINT "whatsapp_tickets_pkey" PRIMARY KEY ("id");



CREATE INDEX "contact_emails_contact_id_idx" ON "public"."contact_emails" USING "btree" ("contact_id");



CREATE UNIQUE INDEX "health_score_history_client_month" ON "public"."health_score_history" USING "btree" ("client_id", "ref_month");



CREATE INDEX "idx_activity_attachments_active" ON "public"."activity_attachments" USING "btree" ("activity_id", "is_deleted");



CREATE INDEX "idx_activity_attachments_activity" ON "public"."activity_attachments" USING "btree" ("activity_id");



CREATE INDEX "idx_activity_attachments_client" ON "public"."activity_attachments" USING "btree" ("client_id");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_entity_type" ON "public"."audit_logs" USING "btree" ("entity_type");



CREATE INDEX "idx_cch_changed_at" ON "public"."client_catalog_history" USING "btree" ("changed_at");



CREATE INDEX "idx_cch_client_id" ON "public"."client_catalog_history" USING "btree" ("client_id");



CREATE UNIQUE INDEX "idx_instances_client_contrato" ON "public"."client_donc_instances" USING "btree" ("client_id", "contrato_saas_id");



CREATE INDEX "idx_onb_act_types_active" ON "public"."onboarding_activity_types" USING "btree" ("active");



CREATE INDEX "idx_onb_activities_fase" ON "public"."onboarding_activities" USING "btree" ("fase_id");



CREATE INDEX "idx_onb_activities_onb" ON "public"."onboarding_activities" USING "btree" ("onboarding_id");



CREATE INDEX "idx_onb_activities_status" ON "public"."onboarding_activities" USING "btree" ("status");



CREATE INDEX "idx_onb_capabilities_onb" ON "public"."onboarding_capabilities" USING "btree" ("onboarding_id");



CREATE INDEX "idx_onb_evidencias_fase" ON "public"."onboarding_evidencias" USING "btree" ("fase_id");



CREATE INDEX "idx_onb_evidencias_pendencia" ON "public"."onboarding_evidencias" USING "btree" ("pendencia_id");



CREATE INDEX "idx_onb_fase_types_active" ON "public"."onboarding_fase_types" USING "btree" ("active");



CREATE INDEX "idx_onb_fases_onb" ON "public"."onboarding_fases" USING "btree" ("onboarding_id");



CREATE INDEX "idx_onb_fases_status" ON "public"."onboarding_fases" USING "btree" ("onboarding_id", "status");



CREATE INDEX "idx_onb_fases_type" ON "public"."onboarding_fases" USING "btree" ("fase_type_id");



CREATE INDEX "idx_onb_pendencias_activity" ON "public"."onboarding_pendencias" USING "btree" ("activity_id");



CREATE INDEX "idx_onb_pendencias_fase" ON "public"."onboarding_pendencias" USING "btree" ("fase_id");



CREATE INDEX "idx_onb_pendencias_onb" ON "public"."onboarding_pendencias" USING "btree" ("onboarding_id");



CREATE INDEX "idx_onb_pendencias_prioridade" ON "public"."onboarding_pendencias" USING "btree" ("prioridade");



CREATE INDEX "idx_onb_pendencias_status" ON "public"."onboarding_pendencias" USING "btree" ("status");



CREATE INDEX "idx_onboardings_client" ON "public"."onboardings" USING "btree" ("client_id");



CREATE INDEX "idx_onboardings_situacao" ON "public"."onboardings" USING "btree" ("situacao_geral");



CREATE INDEX "idx_onboardings_status" ON "public"."onboardings" USING "btree" ("status");



CREATE INDEX "idx_projects_onboarding_id" ON "public"."projects" USING "btree" ("onboarding_id");



CREATE INDEX "idx_projects_type" ON "public"."projects" USING "btree" ("type");



CREATE OR REPLACE TRIGGER "trg_check_marco_evidence" BEFORE UPDATE ON "public"."onboarding_fases" FOR EACH ROW EXECUTE FUNCTION "public"."check_marco_evidence"();



CREATE OR REPLACE TRIGGER "trg_client_catalog_history" AFTER INSERT OR UPDATE ON "public"."client_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."fn_client_catalog_history"();



CREATE OR REPLACE TRIGGER "trg_onb_act_types_updated_at" BEFORE UPDATE ON "public"."onboarding_activity_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_onb_activities_updated_at" BEFORE UPDATE ON "public"."onboarding_activities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_onb_fase_types_updated_at" BEFORE UPDATE ON "public"."onboarding_fase_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_onb_fases_updated_at" BEFORE UPDATE ON "public"."onboarding_fases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_onb_pendencias_updated_at" BEFORE UPDATE ON "public"."onboarding_pendencias" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_templates_updated_at" BEFORE UPDATE ON "public"."project_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_situacao_geral" AFTER INSERT OR DELETE OR UPDATE ON "public"."onboarding_pendencias" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_update_situacao_geral"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."activity_attachments"
    ADD CONSTRAINT "activity_attachments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_attachments"
    ADD CONSTRAINT "activity_attachments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."activity_attachments"
    ADD CONSTRAINT "activity_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."client_catalog"
    ADD CONSTRAINT "client_catalog_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id");



ALTER TABLE ONLY "public"."client_catalog"
    ADD CONSTRAINT "client_catalog_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_catalog_history"
    ADD CONSTRAINT "client_catalog_history_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_catalog_history"
    ADD CONSTRAINT "client_catalog_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_catalog_history"
    ADD CONSTRAINT "client_catalog_history_client_catalog_id_fkey" FOREIGN KEY ("client_catalog_id") REFERENCES "public"."client_catalog"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_catalog_history"
    ADD CONSTRAINT "client_catalog_history_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_donc_instances"
    ADD CONSTRAINT "client_donc_instances_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_reports"
    ADD CONSTRAINT "client_reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_reports"
    ADD CONSTRAINT "client_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."client_support"
    ADD CONSTRAINT "client_support_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_usage"
    ADD CONSTRAINT "client_usage_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_usage"
    ADD CONSTRAINT "client_usage_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."client_donc_instances"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_csm_id_fkey" FOREIGN KEY ("csm_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id");



ALTER TABLE ONLY "public"."contact_emails"
    ADD CONSTRAINT "contact_emails_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_links"
    ADD CONSTRAINT "contact_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_links"
    ADD CONSTRAINT "contact_links_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_phones"
    ADD CONSTRAINT "contact_phones_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donkie_conversations"
    ADD CONSTRAINT "donkie_conversations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donkie_conversations"
    ADD CONSTRAINT "donkie_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."health_score_history"
    ADD CONSTRAINT "health_score_history_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_pricing"
    ADD CONSTRAINT "module_pricing_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id");



ALTER TABLE ONLY "public"."module_pricing"
    ADD CONSTRAINT "module_pricing_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_activities"
    ADD CONSTRAINT "onboarding_activities_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "public"."onboarding_activity_types"("id");



ALTER TABLE ONLY "public"."onboarding_activities"
    ADD CONSTRAINT "onboarding_activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."onboarding_activities"
    ADD CONSTRAINT "onboarding_activities_fase_id_fkey" FOREIGN KEY ("fase_id") REFERENCES "public"."onboarding_fases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."onboarding_activities"
    ADD CONSTRAINT "onboarding_activities_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboardings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_activities"
    ADD CONSTRAINT "onboarding_activities_responsible_contato_id_fkey" FOREIGN KEY ("responsible_contato_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."onboarding_activities"
    ADD CONSTRAINT "onboarding_activities_responsible_interno_id_fkey" FOREIGN KEY ("responsible_interno_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."onboarding_capabilities"
    ADD CONSTRAINT "onboarding_capabilities_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."onboarding_capabilities"
    ADD CONSTRAINT "onboarding_capabilities_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboardings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_evidencias"
    ADD CONSTRAINT "onboarding_evidencias_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."onboarding_evidencias"
    ADD CONSTRAINT "onboarding_evidencias_fase_id_fkey" FOREIGN KEY ("fase_id") REFERENCES "public"."onboarding_fases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_evidencias"
    ADD CONSTRAINT "onboarding_evidencias_pendencia_id_fkey" FOREIGN KEY ("pendencia_id") REFERENCES "public"."onboarding_pendencias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_evidencias"
    ADD CONSTRAINT "onboarding_evidencias_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."onboarding_fases"
    ADD CONSTRAINT "onboarding_fases_fase_type_id_fkey" FOREIGN KEY ("fase_type_id") REFERENCES "public"."onboarding_fase_types"("id");



ALTER TABLE ONLY "public"."onboarding_fases"
    ADD CONSTRAINT "onboarding_fases_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboardings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_pendencias"
    ADD CONSTRAINT "onboarding_pendencias_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."onboarding_activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."onboarding_pendencias"
    ADD CONSTRAINT "onboarding_pendencias_fase_id_fkey" FOREIGN KEY ("fase_id") REFERENCES "public"."onboarding_fases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."onboarding_pendencias"
    ADD CONSTRAINT "onboarding_pendencias_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboardings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_pendencias"
    ADD CONSTRAINT "onboarding_pendencias_responsavel_contato_id_fkey" FOREIGN KEY ("responsavel_contato_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."onboarding_pendencias"
    ADD CONSTRAINT "onboarding_pendencias_responsavel_interno_id_fkey" FOREIGN KEY ("responsavel_interno_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."onboardings"
    ADD CONSTRAINT "onboardings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboardings"
    ADD CONSTRAINT "onboardings_csm_id_fkey" FOREIGN KEY ("csm_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."onboardings"
    ADD CONSTRAINT "onboardings_fase_atual_id_fkey" FOREIGN KEY ("fase_atual_id") REFERENCES "public"."onboarding_fases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."project_template_activities"
    ADD CONSTRAINT "project_template_activities_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "public"."onboarding_activity_types"("id");



ALTER TABLE ONLY "public"."project_template_activities"
    ADD CONSTRAINT "project_template_activities_fase_type_id_fkey" FOREIGN KEY ("fase_type_id") REFERENCES "public"."onboarding_fase_types"("id");



ALTER TABLE ONLY "public"."project_template_activities"
    ADD CONSTRAINT "project_template_activities_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."project_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_template_fases"
    ADD CONSTRAINT "project_template_fases_fase_type_id_fkey" FOREIGN KEY ("fase_type_id") REFERENCES "public"."onboarding_fase_types"("id");



ALTER TABLE ONLY "public"."project_template_fases"
    ADD CONSTRAINT "project_template_fases_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."project_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboardings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."report_views"
    ADD CONSTRAINT "report_views_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."client_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_tickets"
    ADD CONSTRAINT "whatsapp_tickets_analyst_id_fkey" FOREIGN KEY ("analyst_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."whatsapp_tickets"
    ADD CONSTRAINT "whatsapp_tickets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."whatsapp_tickets"
    ADD CONSTRAINT "whatsapp_tickets_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



CREATE POLICY "Allow insert contact_emails" ON "public"."contact_emails" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow read contact_emails" ON "public"."contact_emails" FOR SELECT USING (true);



CREATE POLICY "Allow update contact_emails" ON "public"."contact_emails" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."activities" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."activity_attachments" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."catalog_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."client_catalog" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."client_support" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."client_usage" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."clients" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."contact_links" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."contact_phones" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."contacts" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."health_config" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."health_rules" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."module_pricing" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."onboarding_activities" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."onboarding_activity_types" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."onboarding_capabilities" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."onboarding_config" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."onboarding_evidencias" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."onboarding_fase_types" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."onboarding_fases" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."onboarding_pendencias" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."onboardings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."profiles" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."project_template_activities" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."project_template_fases" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."project_templates" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."projects" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."segments" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users" ON "public"."stages" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."access_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin can update access_requests" ON "public"."access_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "admin manage access_requests" ON "public"."access_requests" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "admin write feature_flags" ON "public"."feature_flags" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "admin write instances" ON "public"."client_donc_instances" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "analyst insert whatsapp_tickets" ON "public"."whatsapp_tickets" FOR INSERT TO "authenticated" WITH CHECK (("analyst_id" = "auth"."uid"()));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_insert" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "audit_logs_select" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated all weights" ON "public"."health_dimension_weights" TO "authenticated" USING (true);



CREATE POLICY "authenticated can read access_requests" ON "public"."access_requests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated read feature_flags" ON "public"."feature_flags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated read history" ON "public"."health_score_history" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated read instances" ON "public"."client_donc_instances" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated read whatsapp_tickets" ON "public"."whatsapp_tickets" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated write history" ON "public"."health_score_history" TO "authenticated" USING (true);



ALTER TABLE "public"."catalog_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_catalog_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_donc_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_support" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_emails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_phones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donkie_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "donkie_config_admin_write" ON "public"."donkie_config" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "donkie_config_read_auth" ON "public"."donkie_config" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "donkie_conv_own_user" ON "public"."donkie_conversations" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."donkie_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."freshdesk_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "freshdesk_config_insert" ON "public"."freshdesk_config" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "freshdesk_config_select" ON "public"."freshdesk_config" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "freshdesk_config_update" ON "public"."freshdesk_config" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



ALTER TABLE "public"."health_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."health_dimension_weights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."health_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."health_score_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."module_pricing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_activity_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_capabilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_evidencias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_fase_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_fases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_pendencias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboardings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_template_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_template_fases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public can insert access_requests" ON "public"."access_requests" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "public can request access" ON "public"."profiles" FOR INSERT TO "anon" WITH CHECK ((("status" = 'pending'::"text") AND ("role" IS NULL)));



CREATE POLICY "public insert access_requests" ON "public"."access_requests" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



ALTER TABLE "public"."report_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_admin_manager" ON "public"."client_reports" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "reports_anon_published" ON "public"."client_reports" FOR SELECT TO "anon" USING ((("status")::"text" = 'published'::"text"));



CREATE POLICY "reports_csm_own" ON "public"."client_reports" USING ((EXISTS ( SELECT 1
   FROM ("public"."profiles" "p"
     JOIN "public"."clients" "c" ON (("c"."csm_id" = "p"."id")))
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'csm'::"text") AND ("c"."id" = "client_reports"."client_id")))));



ALTER TABLE "public"."segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "views_insert_public" ON "public"."report_views" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "views_select_auth" ON "public"."report_views" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."client_reports" "cr"
     JOIN "public"."clients" "c" ON (("c"."id" = "cr"."client_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("cr"."id" = "report_views"."report_id") AND (("p"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])) OR ("c"."csm_id" = "p"."id"))))));



ALTER TABLE "public"."whatsapp_tickets" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."check_marco_evidence"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_marco_evidence"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_marco_evidence"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_report_access"("p_token" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_report_access"("p_token" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_report_access"("p_token" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_fases"("p_onboarding_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_fases"("p_onboarding_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_fases"("p_onboarding_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_client_catalog_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_client_catalog_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_client_catalog_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_situacao_geral"("p_onboarding_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_situacao_geral"("p_onboarding_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_situacao_geral"("p_onboarding_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."register_report_view"("p_report_id" "uuid", "p_email" "text", "p_contact_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."register_report_view"("p_report_id" "uuid", "p_email" "text", "p_contact_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_report_view"("p_report_id" "uuid", "p_email" "text", "p_contact_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_update_situacao_geral"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_update_situacao_geral"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_update_situacao_geral"() TO "service_role";
























GRANT ALL ON TABLE "public"."access_requests" TO "anon";
GRANT ALL ON TABLE "public"."access_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."access_requests" TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."activities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."activities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."activities_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."activity_attachments" TO "anon";
GRANT ALL ON TABLE "public"."activity_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_attachments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."activity_attachments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."activity_attachments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."activity_attachments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_items" TO "anon";
GRANT ALL ON TABLE "public"."catalog_items" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."catalog_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."catalog_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."catalog_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."client_catalog" TO "anon";
GRANT ALL ON TABLE "public"."client_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."client_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."client_catalog_history" TO "anon";
GRANT ALL ON TABLE "public"."client_catalog_history" TO "authenticated";
GRANT ALL ON TABLE "public"."client_catalog_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."client_catalog_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."client_catalog_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."client_catalog_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."client_donc_instances" TO "anon";
GRANT ALL ON TABLE "public"."client_donc_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."client_donc_instances" TO "service_role";



GRANT ALL ON SEQUENCE "public"."client_donc_instances_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."client_donc_instances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."client_donc_instances_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."client_penetration" TO "anon";
GRANT ALL ON TABLE "public"."client_penetration" TO "authenticated";
GRANT ALL ON TABLE "public"."client_penetration" TO "service_role";



GRANT ALL ON TABLE "public"."client_reports" TO "anon";
GRANT ALL ON TABLE "public"."client_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."client_reports" TO "service_role";



GRANT ALL ON TABLE "public"."client_support" TO "anon";
GRANT ALL ON TABLE "public"."client_support" TO "authenticated";
GRANT ALL ON TABLE "public"."client_support" TO "service_role";



GRANT ALL ON SEQUENCE "public"."client_support_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."client_support_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."client_support_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."client_usage" TO "anon";
GRANT ALL ON TABLE "public"."client_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."client_usage" TO "service_role";



GRANT ALL ON SEQUENCE "public"."client_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."client_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."client_usage_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clients_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clients_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clients_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contact_emails" TO "anon";
GRANT ALL ON TABLE "public"."contact_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_emails" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contact_emails_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contact_emails_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contact_emails_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contact_links" TO "anon";
GRANT ALL ON TABLE "public"."contact_links" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_links" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contact_links_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contact_links_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contact_links_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contact_phones" TO "anon";
GRANT ALL ON TABLE "public"."contact_phones" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_phones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contact_phones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contact_phones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contact_phones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contacts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contacts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contacts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."donkie_config" TO "anon";
GRANT ALL ON TABLE "public"."donkie_config" TO "authenticated";
GRANT ALL ON TABLE "public"."donkie_config" TO "service_role";



GRANT ALL ON TABLE "public"."donkie_conversations" TO "anon";
GRANT ALL ON TABLE "public"."donkie_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."donkie_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_flags" TO "service_role";



GRANT ALL ON SEQUENCE "public"."feature_flags_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."feature_flags_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."feature_flags_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."freshdesk_config" TO "anon";
GRANT ALL ON TABLE "public"."freshdesk_config" TO "authenticated";
GRANT ALL ON TABLE "public"."freshdesk_config" TO "service_role";



GRANT ALL ON SEQUENCE "public"."freshdesk_config_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."freshdesk_config_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."freshdesk_config_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."health_config" TO "anon";
GRANT ALL ON TABLE "public"."health_config" TO "authenticated";
GRANT ALL ON TABLE "public"."health_config" TO "service_role";



GRANT ALL ON SEQUENCE "public"."health_config_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."health_config_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."health_config_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."health_dimension_weights" TO "anon";
GRANT ALL ON TABLE "public"."health_dimension_weights" TO "authenticated";
GRANT ALL ON TABLE "public"."health_dimension_weights" TO "service_role";



GRANT ALL ON SEQUENCE "public"."health_dimension_weights_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."health_dimension_weights_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."health_dimension_weights_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."health_rules" TO "anon";
GRANT ALL ON TABLE "public"."health_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."health_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."health_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."health_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."health_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."health_score_history" TO "anon";
GRANT ALL ON TABLE "public"."health_score_history" TO "authenticated";
GRANT ALL ON TABLE "public"."health_score_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."health_score_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."health_score_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."health_score_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."module_pricing" TO "anon";
GRANT ALL ON TABLE "public"."module_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."module_pricing" TO "service_role";



GRANT ALL ON SEQUENCE "public"."module_pricing_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."module_pricing_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."module_pricing_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_activities" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_activities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."onboarding_activities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."onboarding_activities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."onboarding_activities_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_activity_types" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_activity_types" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_activity_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."onboarding_activity_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."onboarding_activity_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."onboarding_activity_types_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_capabilities" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_capabilities" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_capabilities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."onboarding_capabilities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."onboarding_capabilities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."onboarding_capabilities_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_config" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_config" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_config" TO "service_role";



GRANT ALL ON SEQUENCE "public"."onboarding_config_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."onboarding_config_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."onboarding_config_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_evidencias" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_evidencias" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_evidencias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."onboarding_evidencias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."onboarding_evidencias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."onboarding_evidencias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_fase_types" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_fase_types" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_fase_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."onboarding_fase_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."onboarding_fase_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."onboarding_fase_types_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_fases" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_fases" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_fases" TO "service_role";



GRANT ALL ON SEQUENCE "public"."onboarding_fases_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."onboarding_fases_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."onboarding_fases_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_pendencias" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_pendencias" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_pendencias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."onboarding_pendencias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."onboarding_pendencias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."onboarding_pendencias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."onboardings" TO "anon";
GRANT ALL ON TABLE "public"."onboardings" TO "authenticated";
GRANT ALL ON TABLE "public"."onboardings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."onboardings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."onboardings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."onboardings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."project_template_activities" TO "anon";
GRANT ALL ON TABLE "public"."project_template_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."project_template_activities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."project_template_activities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."project_template_activities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."project_template_activities_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."project_template_fases" TO "anon";
GRANT ALL ON TABLE "public"."project_template_fases" TO "authenticated";
GRANT ALL ON TABLE "public"."project_template_fases" TO "service_role";



GRANT ALL ON SEQUENCE "public"."project_template_fases_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."project_template_fases_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."project_template_fases_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."project_templates" TO "anon";
GRANT ALL ON TABLE "public"."project_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."project_templates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."project_templates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."project_templates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."project_templates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON SEQUENCE "public"."projects_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."projects_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."projects_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."report_views" TO "anon";
GRANT ALL ON TABLE "public"."report_views" TO "authenticated";
GRANT ALL ON TABLE "public"."report_views" TO "service_role";



GRANT ALL ON TABLE "public"."segments" TO "anon";
GRANT ALL ON TABLE "public"."segments" TO "authenticated";
GRANT ALL ON TABLE "public"."segments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."segments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."segments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."segments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stages" TO "anon";
GRANT ALL ON TABLE "public"."stages" TO "authenticated";
GRANT ALL ON TABLE "public"."stages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_tickets" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_tickets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."whatsapp_tickets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."whatsapp_tickets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."whatsapp_tickets_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

drop policy "public insert access_requests" on "public"."access_requests";

drop policy "views_insert_public" on "public"."report_views";

alter table "public"."client_reports" drop constraint "client_reports_status_check";

alter table "public"."client_reports" add constraint "client_reports_status_check" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying])::text[]))) not valid;

alter table "public"."client_reports" validate constraint "client_reports_status_check";


  create policy "public insert access_requests"
  on "public"."access_requests"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "views_insert_public"
  on "public"."report_views"
  as permissive
  for insert
  to anon, authenticated
with check (true);


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Allow authenticated read attachments"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'activity-attachments'::text));



  create policy "Allow authenticated upload attachments"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'activity-attachments'::text));



  create policy "Authenticated upload company-logos"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'company-logos'::text));



  create policy "Authenticated upload user-avatars"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'user-avatars'::text));



  create policy "Public read company-logos"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'company-logos'::text));



  create policy "Public read user-avatars"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'user-avatars'::text));



