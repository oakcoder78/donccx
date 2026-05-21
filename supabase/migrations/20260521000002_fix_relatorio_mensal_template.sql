-- ─── replace relatorio_mensal template (Comunicado Geral shell) ──────────
DELETE FROM public.email_templates WHERE name = 'relatorio_mensal';

INSERT INTO public.email_templates (name, subject, html_body, variables) VALUES
('relatorio_mensal', '{{assunto}}',
$html$<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px 32px 0 32px;">

    <div style="text-align:center;margin-bottom:28px;">
      <img src="https://www.pfau.com.br/wp-content/uploads/2026/02/logo-donc-email.png" width="80" alt="DONC" style="display:inline-block;">
    </div>

    <div style="font-size:14px;color:#333333;line-height:1.6;">
      {{corpo_mensagem}}
    </div>

    <div style="height:32px;"></div>
  </div>
  <img src="https://www.pfau.com.br/wp-content/uploads/2026/03/barra.png" width="600" style="display:block;max-width:100%;" alt="">
</body>
</html>$html$,
'["assunto","corpo_mensagem"]');
