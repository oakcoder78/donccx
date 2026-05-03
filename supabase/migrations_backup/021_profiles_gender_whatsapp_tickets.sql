ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('masculino', 'feminino', 'outro'));

CREATE TABLE IF NOT EXISTS whatsapp_tickets (
  id serial PRIMARY KEY,
  analyst_id uuid NOT NULL REFERENCES profiles(id),
  client_id integer NOT NULL REFERENCES clients(id),
  contact_id integer REFERENCES contacts(id),
  freshdesk_ticket_id integer,
  subject text,
  ref_month text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE whatsapp_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read whatsapp_tickets" ON whatsapp_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst insert whatsapp_tickets" ON whatsapp_tickets FOR INSERT TO authenticated WITH CHECK (analyst_id = auth.uid());
