-- ─── seed: relatorio_mensal template ─────────────────────────────────────
INSERT INTO public.email_templates (name, subject, html_body, variables) VALUES
('relatorio_mensal', '{{assunto}}',
$html$<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px 32px 0 32px;">

    <div style="font-size:14px;color:#333333;line-height:1.6;">
      {{corpo_mensagem}}
    </div>

    <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:12px;">
      <tr>
        <td style="vertical-align:top;padding-right:12px;">
          <div style="font-weight:700;color:#173557;font-size:13px;">{{csm_nome}}</div>
          <div style="color:#666666;margin-top:2px;">{{csm_cargo}}</div>
          <div style="color:#333333;margin-top:4px;">{{csm_telefone}}</div>
          <div style="margin-top:2px;">
            <a href="mailto:{{csm_email}}" style="color:#59c2ed;text-decoration:none;">{{csm_email}}</a>
          </div>
        </td>
        <td style="vertical-align:middle;text-align:center;padding:0 12px;width:80px;">
          <img src="https://www.pfau.com.br/wp-content/uploads/2026/02/logo-donc-email.png" width="60" alt="DONC" style="display:block;margin:0 auto;">
        </td>
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
  <img src="https://www.pfau.com.br/wp-content/uploads/2026/03/barra.png" width="600" style="display:block;max-width:100%;" alt="">
</body>
</html>$html$,
'["assunto","corpo_mensagem","csm_nome","csm_cargo","csm_telefone","csm_email"]');
