-- ============================================================
-- 20260520000000_brief_csm_notes_client_questions.sql
-- Extends brief_csm_notes to support client-submitted questions
-- Note: created_by is already nullable (no alter needed)
-- ============================================================

alter table brief_csm_notes
  add column origin text not null default 'csm'
    check (origin in ('csm', 'client')),
  add column client_email text,
  add column client_name text,
  add column csm_reply text,
  add column replied_at timestamptz,
  add column replied_by uuid references profiles(id) on delete set null;

comment on column brief_csm_notes.origin is 'csm = nota interna do CSM | client = dúvida enviada pelo cliente';
comment on column brief_csm_notes.client_email is 'E-mail do contato que enviou a dúvida. Preenchido apenas quando origin = client.';
comment on column brief_csm_notes.csm_reply is 'Resposta do CSM à dúvida do cliente. Visível ao cliente quando is_visible = true.';
comment on column brief_csm_notes.question_id is 'null = dúvida/nota geral não vinculada a pergunta específica.';

create index idx_brief_csm_notes_origin on brief_csm_notes(instance_id, origin);
