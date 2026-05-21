-- ─── replace relatorio_mensal template (corrected HTML) ──────────────
DELETE FROM public.email_templates WHERE name = 'relatorio_mensal';

INSERT INTO public.email_templates (name, subject, html_body, variables) VALUES
('relatorio_mensal', '{{assunto}}',
$html$<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DONC</title>
</head>
<body style="margin:0;padding:0;background-color:#FCFCFC;font-family:Helvetica,Arial,sans-serif;color:#173557;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FCFCFC;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:48px 48px 24px 48px;">
              <img src="https://etfeqblaeuhaobefxilp.supabase.co/storage/v1/object/public/report-images/email-assets/lg_donc_email.png" width="120" alt="DONC" style="display:block;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 48px 48px 48px;">
              <div style="margin:0 0 20px 0;font-size:16px;line-height:28px;color:#173557;">{{corpo_mensagem}}</div>
              <p style="margin:32px 0 0 0;font-size:16px;line-height:28px;color:#173557;">Equipe DONC</p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;margin-top:16px;">
          <tr>
            <td align="center" style="padding:24px 16px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:0 10px;">
                    <a href="https://www.instagram.com/donc_app/" target="_blank" style="text-decoration:none;">
                      <img src="https://cdn.simpleicons.org/instagram/898989" width="28" height="28" alt="Instagram" style="display:block;border:0;" />
                    </a>
                  </td>
                  <td style="padding:0 10px;">
                    <a href="https://www.linkedin.com/company/appdonc/" target="_blank" style="text-decoration:none;">
                      <img src="https://etfeqblaeuhaobefxilp.supabase.co/storage/v1/object/public/report-images/email-assets/icons8-linkedin-50.png" width="32" height="32" alt="LinkedIn" style="display:block;border:0;" />
                    </a>
                  </td>
                  <td style="padding:0 10px;">
                    <a href="https://www.facebook.com/profile.php?id=61550356844331" target="_blank" style="text-decoration:none;">
                      <img src="https://cdn.simpleicons.org/facebook/898989" width="28" height="28" alt="Facebook" style="display:block;border:0;" />
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 8px 0;font-size:13px;line-height:22px;color:#898989;">© 2026 DONC. Todos os direitos reservados.</p>
              <p style="margin:0;font-size:13px;line-height:10px;color:#898989;">Florianópolis, SC · Brasil</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$html$,
'["assunto","corpo_mensagem"]');
