-- ─── profiles: add cargo ──────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text;

-- ─── email_templates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_templates (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text    NOT NULL,
  subject    text    NOT NULL,
  html_body  text    NOT NULL,
  variables  jsonb   DEFAULT '[]',
  active     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ─── email_logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_logs (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid    REFERENCES public.email_templates(id),
  client_id       integer REFERENCES public.clients(id),
  contact_id      integer REFERENCES public.contacts(id),
  sent_by         uuid    REFERENCES public.profiles(id),
  recipient_email text    NOT NULL,
  subject         text    NOT NULL,
  status          text    NOT NULL DEFAULT 'sent'
                          CHECK (status IN ('sent','failed')),
  error_message   text,
  sent_at         timestamptz DEFAULT now()
);

-- ─── indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_email_logs_client_id  ON public.email_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_contact_id ON public.email_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_by    ON public.email_logs(sent_by);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at    ON public.email_logs(sent_at);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_templates" ON public.email_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_write_templates" ON public.email_templates
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK(EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "authenticated_read_logs" ON public.email_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_logs" ON public.email_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── seed: templates ──────────────────────────────────────────────────────────
INSERT INTO public.email_templates (name, subject, html_body, variables) VALUES

('csm_individual', '{{assunto}}',
$html$<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px 32px 0 32px;">

    <!-- corpo da mensagem -->
    <div style="font-size:14px;color:#333333;line-height:1.6;">
      {{corpo_mensagem}}
    </div>

    <!-- separador -->
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">

    <!-- assinatura: tabela 3 colunas -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:12px;">
      <tr>
        <!-- col esquerda: dados do CSM -->
        <td style="vertical-align:top;padding-right:12px;">
          <div style="font-weight:700;color:#173557;font-size:13px;">{{csm_nome}}</div>
          <div style="color:#666666;margin-top:2px;">{{csm_cargo}}</div>
          <div style="color:#333333;margin-top:4px;">{{csm_telefone}}</div>
          <div style="margin-top:2px;">
            <a href="mailto:{{csm_email}}" style="color:#59c2ed;text-decoration:none;">{{csm_email}}</a>
          </div>
        </td>
        <!-- col meio: logo -->
        <td style="vertical-align:middle;text-align:center;padding:0 12px;width:80px;">
          <img src="https://www.pfau.com.br/wp-content/uploads/2026/02/logo-donc-email.png" width="60" alt="DONC" style="display:block;margin:0 auto;">
        </td>
        <!-- col direita: tagline -->
        <td style="vertical-align:middle;text-align:right;padding-left:12px;">
          <div style="color:#666666;font-size:11px;line-height:1.4;">Gestão inteligente para serviços externos</div>
          <div style="margin-top:4px;">
            <span style="color:#173557;font-size:11px;font-weight:600;">donc.com.br</span>
            <span style="color:#173557;font-size:11px;"> &nbsp;|&nbsp; @donc_app</span>
          </div>
        </td>
      </tr>
    </table>

  </div>
  <!-- barra rodapé -->
  <img src="https://www.pfau.com.br/wp-content/uploads/2026/03/barra.png" width="600" style="display:block;max-width:100%;" alt="">
</body>
</html>$html$,
'["assunto","corpo_mensagem","csm_nome","csm_cargo","csm_telefone","csm_email"]'),

('comunicado', '{{assunto}}',
$html2$<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px 32px 0 32px;">

    <!-- logo centralizado no topo -->
    <div style="text-align:center;margin-bottom:28px;">
      <img src="https://www.pfau.com.br/wp-content/uploads/2026/02/logo-donc-email.png" width="80" alt="DONC" style="display:inline-block;">
    </div>

    <!-- corpo da mensagem -->
    <div style="font-size:14px;color:#333333;line-height:1.6;">
      {{corpo_mensagem}}
    </div>

    <div style="height:32px;"></div>
  </div>
  <!-- barra rodapé -->
  <img src="https://www.pfau.com.br/wp-content/uploads/2026/03/barra.png" width="600" style="display:block;max-width:100%;" alt="">
</body>
</html>$html2$,
'["assunto","corpo_mensagem"]');
