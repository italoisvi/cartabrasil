-- ══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO 007: Perfis de colunistas, repórteres e analistas
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reporter' CHECK (role IN ('reporter', 'columnist', 'analyst', 'editor')),
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para busca por role
CREATE INDEX idx_profiles_role ON profiles(role);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode ler perfis
CREATE POLICY "profiles_authenticated_read" ON profiles
  FOR SELECT TO authenticated USING (true);

-- Usuário só edita o próprio perfil
CREATE POLICY "profiles_own_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Qualquer autenticado pode criar seu próprio perfil (registro)
CREATE POLICY "profiles_own_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Leitura pública de perfis (para exibir autor nas notícias)
CREATE POLICY "profiles_public_read" ON profiles
  FOR SELECT TO anon USING (true);

-- Storage: bucket para avatares
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies para avatares
CREATE POLICY "avatars_authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
