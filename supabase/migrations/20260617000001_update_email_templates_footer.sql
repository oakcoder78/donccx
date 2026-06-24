-- update comunicado + relatorio_mensal templates with unsubscribe / view-in-browser footer

-- ─── Helper: add footer to an existing template ───────────────────────────────
-- The footer is appended before </body>

DO $$
DECLARE
  footer text :=
'  <!-- unsubscribe + view-in-browser footer -->
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:0 32px 32px 32px;">
    <div style="border-top:1px solid #e0e0e0;padding:20px 0 0;font-size:12px;color:#898989;line-height:1.6;">
      <p style="margin:0 0 8px 0;">
        O e-mail foi enviado para "{{recipient_email}}".
        Para n&atilde;o receber mais esses e-mails,
        <a href="{{unsubscribe_url}}" style="color:#59c2ed;text-decoration:underline;">cancele a inscri&ccedil;&atilde;o aqui</a>.
      </p>
      <p style="margin:0;">
        Algo errado com o e-mail?
        <a href="{{view_in_browser_url}}" style="color:#59c2ed;text-decoration:underline;">Veja-o no seu navegador</a>.
      </p>
    </div>
  </div>
</body>';

  new_vars jsonb := '["assunto","corpo_mensagem","unsubscribe_url","view_in_browser_url","recipient_email"]'::jsonb;
BEGIN
  -- Update comunicado template
  UPDATE public.email_templates
  SET html_body = regexp_replace(html_body, '</body>\s*</html>\s*$', footer || E'\n</html>', 'n'),
      variables = new_vars
  WHERE name = 'comunicado';

  -- Update relatorio_mensal template
  UPDATE public.email_templates
  SET html_body = regexp_replace(html_body, '</body>\s*</html>\s*$', footer || E'\n</html>', 'n'),
      variables = new_vars
  WHERE name = 'relatorio_mensal';
END $$;
