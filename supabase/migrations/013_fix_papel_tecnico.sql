-- 013 — Fix constraint contact_links_papel_check para incluir 'Técnico'
ALTER TABLE contact_links DROP CONSTRAINT IF EXISTS contact_links_papel_check;
ALTER TABLE contact_links ADD CONSTRAINT contact_links_papel_check
  CHECK (papel IN ('Decisor', 'Influenciador', 'Usuário', 'Técnico'));
