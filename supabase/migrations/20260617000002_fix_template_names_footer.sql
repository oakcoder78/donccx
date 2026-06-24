-- fix template names: comunicado → "Comunicado Geral", relatorio_mensal → "Relatorio Mensal"
-- also remove the duplicate lowercase relatorio_mensal created by previous migration

DO $$
DECLARE
  footer text :=
'  <!-- unsubscribe + view-in-browser footer -->
  <div style="max-width:600px;margin:0 auto;padding:0 16px 32px;font-size:12px;color:#898989;line-height:1.6;text-align:center;">
    <p style="margin:0 0 8px 0;">
      O e-mail foi enviado para &quot;{{recipient_email}}&quot;.
      Para n&atilde;o receber mais esses e-mails,
      <a href="{{unsubscribe_url}}" style="color:#59c2ed;text-decoration:underline;">cancele a inscri&ccedil;&atilde;o aqui</a>.
    </p>
    <p style="margin:0;">
      Algo errado com o e-mail?
      <a href="{{view_in_browser_url}}" style="color:#59c2ed;text-decoration:underline;">Veja-o no seu navegador</a>.
    </p>
  </div>
</body>';

  new_vars jsonb := '["assunto","corpo_mensagem","unsubscribe_url","view_in_browser_url","recipient_email"]'::jsonb;
BEGIN
  -- 1. Update Comunicado Geral
  UPDATE public.email_templates
  SET html_body = regexp_replace(html_body, '</body>\s*</html>\s*$', footer || E'\n</html>', 'n'),
      variables = new_vars
  WHERE name = 'Comunicado Geral';

  -- 2. Update Relatorio Mensal
  UPDATE public.email_templates
  SET html_body = regexp_replace(html_body, '</body>\s*</html>\s*$', footer || E'\n</html>', 'n'),
      variables = new_vars
  WHERE name = 'Relatorio Mensal';

  -- 3. Remove duplicate lowercase relatorio_mensal (old version)
  DELETE FROM public.email_templates WHERE name = 'relatorio_mensal';
END $$;
