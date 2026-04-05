-- ============================================================
-- 005 — Múltiplos e-mails por contato
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_emails (
  id serial PRIMARY KEY,
  contact_id integer REFERENCES contacts(id) ON DELETE CASCADE,
  email text NOT NULL,
  type text DEFAULT 'work' CHECK (type IN ('work','personal','other')),
  is_primary boolean DEFAULT false
);

-- Migra e-mails existentes de contacts.email → contact_emails (primary=true)
INSERT INTO contact_emails (contact_id, email, type, is_primary)
SELECT id, email, 'work', true
FROM contacts
WHERE email IS NOT NULL AND email != ''
ON CONFLICT DO NOTHING;

-- Índice para buscas por contato
CREATE INDEX IF NOT EXISTS contact_emails_contact_id_idx ON contact_emails(contact_id);
