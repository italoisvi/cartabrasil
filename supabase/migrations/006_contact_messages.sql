-- Tabela para mensagens de contato recebidas pelo formulário do site
CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL CHECK (subject IN ('duvida', 'sugestao', 'parceria', 'assinatura', 'outro')),
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: permitir insert anônimo (formulário público), mas leitura apenas para service_role
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert"
  ON contact_messages FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow service_role full access"
  ON contact_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
