-- ─── email_logs: add from_mode column ────────────────────────────────────────
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS from_mode text DEFAULT 'csm';

-- ─── email_templates: fix csm_individual signature HTML ──────────────────────
UPDATE public.email_templates
SET html_body = $csm_tpl$<!DOCTYPE html>
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

    <!-- assinatura -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <!-- col 1: dados do CSM (60%) -->
        <td width="60%" style="vertical-align:top;padding-right:16px;">
          <div style="font-weight:700;color:#173557;font-size:15px;">{{csm_nome}}</div>
          <div style="color:#666666;font-size:12px;margin-top:3px;">{{csm_cargo}}</div>
          <div style="color:#333333;font-size:12px;margin-top:3px;">{{csm_telefone}}</div>
          <div style="margin-top:3px;">
            <a href="mailto:{{csm_email}}" style="color:#59c2ed;text-decoration:none;font-size:12px;">{{csm_email}}</a>
          </div>
        </td>
        <!-- col 2: logo (20%, alinhado à direita) -->
        <td width="20%" style="vertical-align:middle;text-align:right;">
          <img src="https://www.pfau.com.br/wp-content/uploads/2026/02/logo-donc-email.png" width="70" alt="DONC" style="display:block;margin-left:auto;">
        </td>
        <!-- col 3: texto institucional (20%) -->
        <td width="20%" style="vertical-align:top;padding-left:12px;">
          <div style="font-size:11px;color:#666666;line-height:1.4;">Gestão inteligente para serviços externos</div>
          <div style="font-size:11px;color:#173557;margin-top:4px;">donc.com.br</div>
          <div style="font-size:11px;color:#173557;">@donc_app</div>
        </td>
      </tr>
    </table>

    <div style="height:24px;"></div>
  </div>
  <!-- barra rodapé -->
  <img src="https://www.pfau.com.br/wp-content/uploads/2026/03/barra.png" width="100%" style="display:block;max-width:600px;margin:0 auto;" alt="">
</body>
</html>$csm_tpl$
WHERE name = 'csm_individual';
