-- =============================================
-- Carta de Notícia — Schema Inicial
-- =============================================

-- Assinantes
create table subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  categories text[] not null default '{"politica","mercados","internacional","tecnologia"}',
  frequency text not null default 'realtime' check (frequency in ('realtime', 'daily', 'weekly')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Artigos (notícias importadas do RSS)
create table articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  body text,
  category text not null check (category in ('politica', 'mercados', 'internacional', 'tecnologia', 'geral')),
  image_url text,
  image_caption text,
  source_name text not null default 'Agência Brasil',
  source_url text,
  author text,
  original_url text unique not null,
  published_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Índices
create index idx_articles_category on articles (category);
create index idx_articles_published_at on articles (published_at desc);
create index idx_subscribers_active on subscribers (active) where active = true;

-- Storage bucket para imagens (rodar no SQL Editor do Supabase)
insert into storage.buckets (id, name, public) values ('article-images', 'article-images', true);
